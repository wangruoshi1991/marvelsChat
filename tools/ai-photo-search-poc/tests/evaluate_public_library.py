"""Import and evaluate the public library against its separate local server."""
from __future__ import annotations

import argparse
from datetime import datetime
from zoneinfo import ZoneInfo
import hashlib
import json
from pathlib import Path
import statistics
import time

import requests

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:8766")
args = parser.parse_args()
base = args.base_url.rstrip("/")
session = requests.Session()
session.trust_env = False
root = Path(__file__).resolve().parent / "public-library"
manifest = json.loads((root / "SOURCES.json").read_text())
photos = manifest["images"]
query_path = root / "queries.json"
query_bytes = query_path.read_bytes()
queries = json.loads(query_bytes)["queries"]
expected_filenames = {Path(p["file"]).name for p in photos}


def api(method, path, **kwargs):
    response = session.request(method, base + path, timeout=120, **kwargs)
    response.raise_for_status()
    return response.json()


existing = api("GET", "/api/photos?limit=1000")
if any(p["filename"] not in expected_filenames for p in existing["photos"]):
    raise RuntimeError("This server contains other photos; use the separate public-test data directory.")
started = time.monotonic()
for offset in range(0, len(photos), 10):
    batch = photos[offset:offset + 10]
    handles = []
    try:
        for record in batch:
            path = root / record["file"]
            handles.append(("files", (path.name, path.open("rb"), "image/jpeg")))
        result = api("POST", "/api/photos", files=handles)
        assert not result["errors"], result
        print(json.dumps({"batch": offset // 10 + 1, **result}, ensure_ascii=False), flush=True)
    finally:
        for _, (_, handle, _) in handles:
            handle.close()

deadline = time.monotonic() + 900
previous = None
while time.monotonic() < deadline:
    state = api("GET", "/api/status")
    assert state["model"]["state"] != "error" and state["failed_count"] == 0, state
    progress = (state["model"]["state"], state["ready_count"])
    if progress != previous:
        print(json.dumps({"model": progress[0], "indexed": progress[1], "total": len(photos)}), flush=True)
        previous = progress
    if state["ready_count"] == len(photos) and state["pending_count"] == 0:
        break
    time.sleep(2)
else:
    raise RuntimeError("Indexing did not complete")
import_and_index_seconds = round(time.monotonic() - started, 2)

results = []
for query in queries:
    response = api("POST", "/api/search", json={"query": query["text"], "limit": len(photos)})
    assert response["indexed_count"] == len(photos)
    ranked = [Path(photo["filename"]).stem for photo in response["results"]]
    expected = set(query.get("expected_ids", []))
    best_rank = next((i + 1 for i, image_id in enumerate(ranked) if image_id in expected), None)
    record = {
        **query, "best_expected_rank": best_rank,
        "hit_at_1": best_rank == 1 if expected else None,
        "hit_at_5": best_rank is not None and best_rank <= 5 if expected else None,
        "elapsed_ms": response["elapsed_ms"],
        "top_5": [{"id": Path(photo["filename"]).stem, "score": photo["score"]} for photo in response["results"][:5]],
    }
    results.append(record)
    print(json.dumps({"query": query["text"], "rank": best_rank, "ms": response["elapsed_ms"]}, ensure_ascii=False), flush=True)

positive = [r for r in results if r.get("expected_ids")]
times = sorted(r["elapsed_ms"] for r in results)
report = {
    "evaluated_on": datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat(), "photo_count": len(photos),
    "query_file_sha256": hashlib.sha256(query_bytes).hexdigest(),
    "query_count": len(results), "positive_query_count": len(positive),
    "top_1_hits": sum(r["hit_at_1"] for r in positive),
    "top_5_hits": sum(r["hit_at_5"] for r in positive),
    "top_1_rate": round(sum(r["hit_at_1"] for r in positive) / len(positive), 4),
    "top_5_rate": round(sum(r["hit_at_5"] for r in positive) / len(positive), 4),
    "latency_ms": {"median": statistics.median(times), "min": min(times), "max": max(times)},
    "import_and_index_seconds": import_and_index_seconds,
    "model": state["model"],
    "metric_definition": "A hit means at least one preselected visually verified reference photo occurs in the first K results; this is not exhaustive semantic relevance accuracy or recall.",
    "limitations": ["Small manually selected public sample, not a held-out personal-album benchmark.",
                   "Queries and reference photos were fixed before running retrieval.",
                   "Other relevant photos may exist beyond the preselected references.",
                   "Queries with no reference photos are diagnostics and excluded from hit rates."],
    "results": results,
}
output = root.parents[1] / ".run" / "public-library-results.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in report.items() if k != "results"}, ensure_ascii=False, indent=2), flush=True)
