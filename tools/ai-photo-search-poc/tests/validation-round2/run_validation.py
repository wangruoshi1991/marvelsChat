"""Run a frozen second-round query set against the 60-photo local album."""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime
import hashlib
import json
from pathlib import Path
import statistics
import time
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parent
LIBRARY = ROOT.parent / "public-library"
parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:8766")
args = parser.parse_args()
BASE = args.base_url.rstrip("/")
session = requests.Session()
session.trust_env = False
raw_queries = (ROOT / "queries.json").read_bytes()
queries = json.loads(raw_queries)["queries"]
manifest_bytes = (LIBRARY / "SOURCES.json").read_bytes()
photos = json.loads(manifest_bytes)["images"]
by_hash = {photo["sha256"]: photo for photo in photos}


def api(path, **kwargs):
    response = session.request("POST" if kwargs else "GET", BASE + path, timeout=60, **kwargs)
    response.raise_for_status()
    return response.json()


status = api("/api/status")
assert status["ready_count"] == len(photos) == 60, status
loaded = api("/api/photos?limit=1000")["photos"]
assert {p["id"] for p in loaded} == set(by_hash), "Album differs from the frozen public sample."

results = []
for query in queries:
    began = time.perf_counter()
    response = api("/api/search", json={"query": query["text"], "limit": 60})
    wall_ms = round((time.perf_counter() - began) * 1000, 1)
    assert response["indexed_count"] == 60
    ranked = [by_hash[photo["id"]]["id"] for photo in response["results"]]
    expected = set(query["expected_ids"])
    best_rank = next((index + 1 for index, image_id in enumerate(ranked) if image_id in expected), None)
    result = {
        **query,
        "best_expected_rank": best_rank,
        "hit_at_1": best_rank == 1 if expected else None,
        "hit_at_5": best_rank is not None and best_rank <= 5 if expected else None,
        "returned_count": len(ranked),
        "backend_ms": response["elapsed_ms"], "round_trip_ms": wall_ms,
        "top_5": [{"id": by_hash[p["id"]]["id"], "score": p["score"]} for p in response["results"][:5]],
        "all_ranked_ids": ranked,
    }
    results.append(result)
    print(json.dumps({"id": query["id"], "query": query["text"], "top_1": ranked[0] if ranked else None,
                      "reference_rank": best_rank, "backend_ms": response["elapsed_ms"]}, ensure_ascii=False), flush=True)

groups = defaultdict(list)
for result in results:
    groups[result["group"]].append(result)
summary = {}
for name, members in groups.items():
    positive = [r for r in members if r["expected_ids"]]
    summary[name] = {"queries": len(members), "top_1_hits": sum(r["hit_at_1"] for r in positive),
                     "top_5_hits": sum(r["hit_at_5"] for r in positive),
                     "correctly_returned_empty": sum(r["returned_count"] == 0 for r in members) if not positive else None}
positive = [r for r in results if r["expected_ids"]]
backend = [r["backend_ms"] for r in results]
wall = [r["round_trip_ms"] for r in results]
report = {
    "evaluated_at": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(),
    "photo_count": 60, "queries": len(results), "positive_queries": len(positive),
    "top_1_hits": sum(r["hit_at_1"] for r in positive),
    "top_5_hits": sum(r["hit_at_5"] for r in positive),
    "groups": summary,
    "latency_ms": {"backend_median": statistics.median(backend), "backend_max": max(backend),
                   "round_trip_median": statistics.median(wall), "round_trip_max": max(wall)},
    "query_file_sha256": hashlib.sha256(raw_queries).hexdigest(),
    "source_manifest_sha256": hashlib.sha256(manifest_bytes).hexdigest(),
    "method": "New queries and visually selected references were frozen before retrieval. Same existing 60-photo corpus; no model or ranking changes.",
    "metric": "At least one preselected reference photo appears in top K; not exhaustive relevance accuracy or recall.",
    "results": results,
}
output = ROOT.parents[1] / ".run" / "validation-round2-results.json"
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in report.items() if k != "results"}, ensure_ascii=False, indent=2), flush=True)
