"""Exercise the real HTTP + model path against an EMPTY, isolated test server.

PHOTO_SEARCH_DATA=/tmp/miaoxun-test .venv/bin/python -m uvicorn app:app --port 8766
.venv/bin/python tests/smoke.py http://127.0.0.1:8766
The four public fixtures are retained for visual review; do not use a personal album.
"""
import json
from pathlib import Path
import sys
import time

import requests

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8766"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
samples = json.loads((FIXTURES / "SOURCES.json").read_text())["images"]


def get(path):
    response = requests.get(BASE + path, timeout=30)
    response.raise_for_status()
    return response.json()


assert get("/api/status")["photo_count"] == 0, "Use an empty, isolated test album."
assert requests.post(BASE + "/api/search", json={"query": "   "}, timeout=30).status_code == 400
assert requests.post(BASE + "/api/search", json={"query": "猫", "limit": 0}, timeout=30).status_code == 422
assert requests.post(BASE + "/api/model/load", headers={"Origin": "https://example.org"}, timeout=30).status_code == 403

invalid = requests.post(BASE + "/api/photos", files={"files": ("invalid.jpg", b"not-an-image")}, timeout=30).json()
assert invalid["accepted"] == 0 and len(invalid["errors"]) == 1

for sample in samples:
    with (FIXTURES / sample["file"]).open("rb") as photo:
        response = requests.post(BASE + "/api/photos", files={"files": (sample["file"], photo)}, timeout=30)
    response.raise_for_status()
    assert response.json()["accepted"] == 1, response.text
with (FIXTURES / samples[0]["file"]).open("rb") as photo:
    duplicate = requests.post(BASE + "/api/photos", files={"files": ("renamed.png", photo)}, timeout=30).json()
assert duplicate["duplicates"] == 1 and duplicate["accepted"] == 0

deadline = time.monotonic() + 1200
last_state = None
while time.monotonic() < deadline:
    state = get("/api/status")
    progress = (state["model"]["state"], state["ready_count"], state["failed_count"])
    if progress != last_state:
        print(json.dumps({"progress": state}, ensure_ascii=False), flush=True)
        last_state = progress
    assert state["model"]["state"] != "error", state
    assert state["failed_count"] == 0, state
    if state["ready_count"] == len(samples):
        break
    time.sleep(2)
else:
    raise AssertionError("Model preparation or indexing timed out")

(Path(__file__).parents[1] / ".run").mkdir(exist_ok=True)
report = []
for sample in samples:
    query = sample["smoke_query_zh"]
    response = requests.post(BASE + "/api/search", json={"query": query, "limit": 4}, timeout=60)
    response.raise_for_status()
    result = response.json()
    top = result["results"][0]
    report.append({"query": query, "expected": sample["file"], "top_1": top["filename"],
                   "elapsed_ms": result["elapsed_ms"], "score": top["score"],
                   "passed": top["filename"] == sample["file"]})
    assert top["filename"] == sample["file"], result
    assert result["indexed_count"] == 4
    scores = [r["score"] for r in result["results"]]
    assert scores == sorted(scores, reverse=True)
    assert requests.get(BASE + top["thumbnail_url"], timeout=30).headers["content-type"] == "image/jpeg"
    response = requests.post(BASE + "/api/feedback", json={"query": query, "photo_id": top["id"], "relevant": True, "rank": 1}, timeout=30)
    assert response.json() == {"saved": True}

long_query = requests.post(BASE + "/api/search", json={"query": "猫" * 100}, timeout=30)
assert long_query.status_code == 400, long_query.text
export = get("/api/evaluation")
assert len(export["searches"]) == 4 and len(export["feedback"]) == 4
assert len(get("/api/photos")["photos"]) == 4
output = {"kind": "public-fixture-smoke-test", "photo_count": 4, "queries": report,
          "note": "These distinct public images validate the execution path, not personal-album search quality."}
(Path(__file__).parents[1] / ".run" / "smoke-result.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(output, ensure_ascii=False, indent=2), flush=True)
print("PASS: imports, duplicate detection, malformed input, local-only access, real embeddings, Chinese retrieval, image delivery, feedback, and export.", flush=True)
