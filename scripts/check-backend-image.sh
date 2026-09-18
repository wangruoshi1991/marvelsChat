#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s <image-tag>\n' "$0" >&2
  exit 1
fi

container_id=""
cleanup() {
  if [[ -n "$container_id" ]]; then
    docker logs "$container_id" || true
    docker rm -f "$container_id" >/dev/null
  fi
}
trap cleanup EXIT

container_id="$(docker run --detach --network none \
  --env NODE_ENV=production \
  --env DEFAULT_ADMIN_ENABLED=false \
  --env CREATE_FIRST_USER_AS_ADMIN=false \
  --env AVATAR_3D_ENABLED=false \
  --env MEDIA_RETRIEVAL_ENABLED=false \
  --env HOST=127.0.0.1 \
  --env PORT=4390 \
  "$1")"

# The isolated smoke container has no database or Provider credentials.
docker exec "$container_id" node --input-type=module -e '
import assert from "node:assert/strict";
let healthy = false;
for (let attempt = 0; attempt < 20; attempt += 1) {
  try {
    const response = await fetch("http://127.0.0.1:4390/api/health", { signal: AbortSignal.timeout(1000) });
    const body = await response.json();
    healthy = response.ok && body.ok === true && body.service === "miaoxun-backend";
    if (healthy) break;
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert.equal(healthy, true, "Backend image did not become healthy");
const ready = await fetch("http://127.0.0.1:4390/api/ready", { signal: AbortSignal.timeout(2000) });
assert.equal(ready.status, 503, "Unconfigured database must not report readiness");
const agents = await fetch("http://127.0.0.1:4390/api/agents");
assert.equal(agents.status, 200);
assert.ok((await agents.json()).data.length > 0, "Dynamic Agent definitions must load");
await import("./src/media-retrieval-worker.js");
console.log("Backend startup, Agent loading, worker imports, and missing-database readiness passed.");
'
