"""Local-only Chinese photo retrieval. Run with ./start.command."""

from __future__ import annotations

import hashlib
import io
import ipaddress
import json
import logging
import os
from pathlib import Path
import sqlite3
import threading
import time
from contextlib import asynccontextmanager, contextmanager

os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field
from pillow_heif import register_heif_opener

register_heif_opener()
Image.MAX_IMAGE_PIXELS = 60_000_000

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get("PHOTO_SEARCH_DATA", str(ROOT / ".data"))).resolve()
MODEL_CACHE = ROOT / ".cache" / "models"
MODEL_ID = "OFA-Sys/chinese-clip-vit-base-patch16"
MODEL_REVISION = "36e679e65c2a2fead755ae21162091293ad37834"
INDEX_VERSION = f"{MODEL_ID}@{MODEL_REVISION}:transformers-4.57.1:rgb-jpeg2048-v1"
MAX_FILE_BYTES = 30 * 1024 * 1024
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "testserver"} | {
    host.strip().lower() for host in os.environ.get("PHOTO_SEARCH_ALLOWED_HOSTS", "").split(",") if host.strip()
}
LAN_CIDR = os.environ.get("PHOTO_SEARCH_LAN_CIDR", "")
LAN_NETWORK = ipaddress.ip_network(LAN_CIDR, strict=False) if LAN_CIDR else None
logger = logging.getLogger("photo_search")


class PhotoStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.credits = {}
        credit_path = os.environ.get("PHOTO_SEARCH_SOURCES")
        if credit_path:
            manifest = json.loads(Path(credit_path).read_text())
            self.credits = {item["sha256"]: {
                key: item.get(key, "") for key in ("author", "license", "license_url", "source_page")
            } for item in manifest["images"]}
        self.images = directory / "images"
        self.thumbs = directory / "thumbnails"
        self.images.mkdir(parents=True, exist_ok=True)
        self.thumbs.mkdir(parents=True, exist_ok=True)
        self.path = directory / "photos.sqlite3"
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS photos (
                    id TEXT PRIMARY KEY, filename TEXT NOT NULL,
                    width INTEGER NOT NULL, height INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending', embedding BLOB,
                    error TEXT, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS searches (
                    id INTEGER PRIMARY KEY, query TEXT NOT NULL,
                    result_ids TEXT NOT NULL, scores TEXT NOT NULL,
                    elapsed_ms REAL NOT NULL, indexed_count INTEGER NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS feedback (
                    query TEXT NOT NULL, photo_id TEXT NOT NULL,
                    relevant INTEGER NOT NULL, rank INTEGER NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (query, photo_id)
                );
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            previous = db.execute("SELECT value FROM metadata WHERE key='index_version'").fetchone()
            if previous is None or previous["value"] != INDEX_VERSION:
                db.execute("UPDATE photos SET status='pending',embedding=NULL,error=NULL")
                db.execute("INSERT OR REPLACE INTO metadata(key,value) VALUES('index_version',?)", (INDEX_VERSION,))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def counts(self):
        counts = {"pending": 0, "ready": 0, "error": 0}
        with self.connect() as db:
            for row in db.execute("SELECT status, COUNT(*) AS n FROM photos GROUP BY status"):
                counts[row["status"]] = row["n"]
        return counts

    def public(self, row):
        result = {
            "id": row["id"], "filename": row["filename"],
            "status": row["status"],
            "thumbnail_url": f"/media/thumbnails/{row['id']}.jpg",
            "image_url": f"/media/images/{row['id']}.jpg",
        }
        if row["id"] in self.credits:
            result["attribution"] = self.credits[row["id"]]
        return result

    def add(self, content: bytes, filename: str):
        image_id = hashlib.sha256(content).hexdigest()
        with self.connect() as db:
            if db.execute("SELECT 1 FROM photos WHERE id=?", (image_id,)).fetchone():
                return False
        with Image.open(io.BytesIO(content)) as original:
            original.seek(0)
            original.load()
            # Decode, correct camera orientation, and discard EXIF/GPS metadata.
            oriented = ImageOps.exif_transpose(original)
            if oriented.mode in ("RGBA", "LA") or "transparency" in oriented.info:
                rgba = oriented.convert("RGBA")
                rgb = Image.new("RGB", rgba.size, "white")
                rgb.paste(rgba, mask=rgba.getchannel("A"))
            else:
                rgb = oriented.convert("RGB")
            width, height = rgb.size
            rgb.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            rgb.save(self.images / f"{image_id}.jpg", quality=91, exif=b"")
            rgb.thumbnail((480, 480), Image.Resampling.LANCZOS)
            rgb.save(self.thumbs / f"{image_id}.jpg", quality=85, exif=b"")
        with self.connect() as db:
            db.execute(
                "INSERT OR IGNORE INTO photos(id,filename,width,height,created_at) VALUES(?,?,?,?,?)",
                (image_id, Path(filename.replace("\\", "/")).name[:255], width, height, time.time()),
            )
        return True


class PhotoEngine:
    def __init__(self, store: PhotoStore):
        self.store = store
        self.state = "idle"
        self.error = None
        self.device = ""
        self.model = None
        self.processor = None
        self.lock = threading.RLock()
        self.inference_lock = threading.Lock()
        self.mutation_lock = threading.RLock()
        self.wake = threading.Event()
        self.stop = threading.Event()
        self.indexing = {"active": False, "current": 0, "total": 0, "last_error": None}
        self.thread = threading.Thread(target=self._work, daemon=True, name="photo-indexer")

    def start(self):
        self.thread.start()
        if sum(self.store.counts().values()):
            self.wake.set()

    def request_load(self):
        self.wake.set()

    def snapshot(self):
        counts = self.store.counts()
        with self.lock:
            return {
                "photo_count": sum(counts.values()), "ready_count": counts["ready"],
                "pending_count": counts["pending"], "failed_count": counts["error"],
                "model": {"state": self.state, "name": MODEL_ID,
                          "device": self.device, "error": self.error},
                "indexing": dict(self.indexing),
                "network_mode": "lan" if LAN_NETWORK else "local",
            }

    def _load(self):
        if self.state == "ready":
            return True
        with self.lock:
            self.state = "loading"
            self.error = None
        try:
            import torch
            from transformers import ChineseCLIPModel, ChineseCLIPProcessor

            torch.set_num_threads(min(4, os.cpu_count() or 1))
            self.device = "mps" if torch.backends.mps.is_available() else "cpu"
            model_args = {"cache_dir": str(MODEL_CACHE), "revision": MODEL_REVISION}
            # Use the complete local cache first, so subsequent runs work offline.
            try:
                processor = ChineseCLIPProcessor.from_pretrained(MODEL_ID, local_files_only=True, use_fast=False, **model_args)
                model = ChineseCLIPModel.from_pretrained(MODEL_ID, local_files_only=True, use_safetensors=False, **model_args)
            except OSError:
                processor = ChineseCLIPProcessor.from_pretrained(MODEL_ID, use_fast=False, **model_args)
                model = ChineseCLIPModel.from_pretrained(MODEL_ID, use_safetensors=False, **model_args)
            model = model.to(self.device).eval()
            with self.lock:
                self.model, self.processor = model, processor
                self.state = "ready"
            return True
        except Exception as exc:
            logger.exception("Model load failed")
            with self.lock:
                self.state = "error"
                self.error = f"模型加载失败：{type(exc).__name__}。请检查网络与磁盘空间，然后重试。"
            return False

    def _features(self, *, image=None, text=None):
        import torch
        import torch.nn.functional as F
        with self.inference_lock, torch.inference_mode():
            if image is not None:
                inputs = self.processor(images=image, return_tensors="pt").to(self.device)
                features = self.model.get_image_features(**inputs)
            else:
                inputs = self.processor(text=[text], return_tensors="pt", padding=True,
                                        truncation=True, max_length=64).to(self.device)
                # Transformers 4.57.1 get_text_features incorrectly accesses a
                # disabled pooler. Match ChineseCLIPModel.forward: project CLS.
                text_output = self.model.text_model(**inputs, return_dict=True)
                features = self.model.text_projection(text_output.last_hidden_state[:, 0, :])
            return F.normalize(features.float(), dim=-1).cpu().numpy().astype(np.float32)[0]

    def _work(self):
        while not self.stop.is_set():
            self.wake.wait(timeout=1)
            if not self.wake.is_set():
                continue
            self.wake.clear()
            if not self._load():
                continue
            with self.lock:
                self.indexing.update(active=True, current=0,
                                     total=self.store.counts()["pending"], last_error=None)
            while not self.stop.is_set():
                # Serialize reset with image access and updates, not with model download.
                with self.mutation_lock:
                    with self.store.connect() as db:
                        row = db.execute("SELECT * FROM photos WHERE status='pending' ORDER BY created_at LIMIT 1").fetchone()
                    if row is None:
                        break
                    try:
                        with Image.open(self.store.images / f"{row['id']}.jpg") as img:
                            vector = self._features(image=img.convert("RGB"))
                        with self.store.connect() as db:
                            db.execute("UPDATE photos SET status='ready',embedding=?,error=NULL WHERE id=?",
                                       (vector.tobytes(), row["id"]))
                    except Exception as exc:
                        logger.exception("Photo indexing failed")
                        error = f"{row['filename']}：{type(exc).__name__}"
                        with self.store.connect() as db:
                            db.execute("UPDATE photos SET status='error',error=? WHERE id=?", (error, row["id"]))
                        with self.lock:
                            self.indexing["last_error"] = error
                with self.lock:
                    self.indexing["current"] += 1
                    self.indexing["total"] = self.indexing["current"] + self.store.counts()["pending"]
            with self.lock:
                self.indexing["active"] = False

    def search(self, query, limit):
        if self.state != "ready":
            self.request_load()
            raise HTTPException(503, "模型正在准备，请稍后重试。首次启动需要下载约753 MB的模型。")
        start = time.perf_counter()
        if len(self.processor.tokenizer(query, truncation=False)["input_ids"]) > 64:
            raise HTTPException(400, "描述过长，请缩短到约60个汉字以内，再试一次。")
        # Keep query vectors and result rows consistent with a concurrent clear.
        with self.mutation_lock:
            with self.store.connect() as db:
                rows = db.execute("SELECT * FROM photos WHERE status='ready' ORDER BY created_at,id").fetchall()
            if not rows:
                raise HTTPException(409, "还没有可检索的照片，请先导入照片并等待索引完成。")
            query_vector = self._features(text=query)
            vectors = np.stack([np.frombuffer(row["embedding"], dtype=np.float32) for row in rows])
            scores = vectors @ query_vector
            order = np.argsort(-scores, kind="stable")[:limit]
            results = [dict(self.store.public(rows[int(i)]), score=round(float(scores[i]), 5)) for i in order]
            elapsed = round((time.perf_counter() - start) * 1000, 1)
            with self.store.connect() as db:
                db.execute("INSERT INTO searches(query,result_ids,scores,elapsed_ms,indexed_count,created_at) VALUES(?,?,?,?,?,?)",
                           (query, json.dumps([r["id"] for r in results]),
                            json.dumps([r["score"] for r in results]), elapsed, len(rows), time.time()))
        return {"query": query, "results": results, "elapsed_ms": elapsed, "indexed_count": len(rows)}


store = PhotoStore(DATA)
engine = PhotoEngine(store)


@asynccontextmanager
async def lifespan(app):
    engine.start()
    yield
    engine.stop.set()
    engine.wake.set()


app = FastAPI(title="妙讯 · 相册语义检索 PoC", lifespan=lifespan)


@app.middleware("http")
async def allowed_access(request: Request, call_next):
    from urllib.parse import urlparse
    try:
        host = urlparse("http://" + request.headers.get("host", "")).hostname
    except ValueError:
        host = None
    if host not in ALLOWED_HOSTS:
        return JSONResponse({"detail": "请使用启动窗口显示的访问地址。"}, status_code=403)
    if LAN_NETWORK:
        try:
            peer = ipaddress.ip_address(request.client.host if request.client else "")
        except ValueError:
            return JSONResponse({"detail": "无法确认访问来源。"}, status_code=403)
        if not peer.is_loopback and peer not in LAN_NETWORK:
            return JSONResponse({"detail": "此测试相册只允许同一局域网访问。"}, status_code=403)
    origin = request.headers.get("origin")
    if origin and urlparse(origin).netloc != request.headers.get("host"):
        return JSONResponse({"detail": "此服务不接受其他网站的请求。"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    return response


@app.get("/")
def home():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/status")
def status():
    return engine.snapshot()


@app.post("/api/model/load")
def load_model():
    engine.request_load()
    return {"state": engine.state}


@app.get("/api/photos")
def list_photos(limit: int = 60):
    with store.connect() as db:
        rows = db.execute("SELECT * FROM photos ORDER BY created_at DESC LIMIT ?", (max(1, min(limit, 1000)),)).fetchall()
    return {"photos": [store.public(row) for row in rows], "total": sum(store.counts().values())}


@app.post("/api/photos")
def import_photos(files: list[UploadFile] = File(...)):
    if len(files) > 50:
        raise HTTPException(400, "每批最多导入50张照片。")
    accepted, duplicates, errors = 0, 0, []
    for file in files:
        filename = file.filename or "未命名照片"
        try:
            content = file.file.read(MAX_FILE_BYTES + 1)
            if len(content) > MAX_FILE_BYTES:
                raise ValueError("文件超过30 MB，请先缩小照片。")
            with engine.mutation_lock:
                if store.add(content, filename):
                    accepted += 1
                else:
                    duplicates += 1
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            message = str(exc) if isinstance(exc, ValueError) else "无法读取此照片，请使用JPG、PNG、WebP或HEIC格式。"
            errors.append({"filename": filename, "error": message})
        finally:
            file.file.close()
    if accepted:
        engine.request_load()
    return {"accepted": accepted, "duplicates": duplicates, "errors": errors}


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=120)
    limit: int = Field(default=12, ge=1, le=100)


@app.post("/api/search")
def search(body: SearchRequest):
    query = body.query.strip()
    if not query:
        raise HTTPException(400, "请描述你想找的照片。")
    try:
        return engine.search(query, body.limit)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Search failed")
        raise HTTPException(500, "这次搜索未完成，请重试；如果持续失败，请查看终端提示。")


class FeedbackRequest(BaseModel):
    query: str = Field(min_length=1, max_length=120)
    photo_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    relevant: bool
    rank: int = Field(ge=1, le=100)


@app.post("/api/feedback")
def feedback(body: FeedbackRequest):
    with engine.mutation_lock, store.connect() as db:
        if not db.execute("SELECT 1 FROM photos WHERE id=?", (body.photo_id,)).fetchone():
            raise HTTPException(404, "照片已被移除。")
        db.execute("INSERT OR REPLACE INTO feedback(query,photo_id,relevant,rank,created_at) VALUES(?,?,?,?,?)",
                   (body.query, body.photo_id, int(body.relevant), body.rank, time.time()))
    return {"saved": True}


@app.get("/api/evaluation")
def evaluation():
    with store.connect() as db:
        searches = [dict(row) for row in db.execute("SELECT * FROM searches ORDER BY id")]
        feedback_rows = [dict(row) for row in db.execute("SELECT * FROM feedback ORDER BY created_at")]
    return {"searches": searches, "feedback": feedback_rows,
            "note": "反馈仅覆盖人工标注结果，不能直接视为完整准确率或召回率。"}


@app.delete("/api/photos")
def clear_photos():
    with engine.mutation_lock:
        with store.connect() as db:
            count = db.execute("SELECT COUNT(*) FROM photos").fetchone()[0]
            db.execute("DELETE FROM photos")
            db.execute("DELETE FROM searches")
            db.execute("DELETE FROM feedback")
        for directory in (store.images, store.thumbs):
            for path in directory.glob("*.jpg"):
                path.unlink(missing_ok=True)
        with engine.lock:
            engine.indexing.update(active=False, current=0, total=0, last_error=None)
    return {"deleted": count}


app.mount("/static", StaticFiles(directory=ROOT / "static", check_dir=False), name="static")
app.mount("/media/images", StaticFiles(directory=store.images), name="images")
app.mount("/media/thumbnails", StaticFiles(directory=store.thumbs), name="thumbnails")
