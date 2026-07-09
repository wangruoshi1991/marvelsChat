#!/usr/bin/env bash

set -u

DOMAIN="${DOMAIN:-marvelschat.com}"
API_DOMAIN="${API_DOMAIN:-api.marvelschat.com}"
CONSOLE_DOMAIN="${CONSOLE_DOMAIN:-console.marvelschat.com}"
EXPECTED_IP="${EXPECTED_IP:-8.153.167.11}"
REMOTE_HOST="${REMOTE_HOST:-marvels-chat}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

failures=0
warnings=0

pass() {
  printf 'PASS %s\n' "$1"
}

warn() {
  warnings=$((warnings + 1))
  printf 'WARN %s\n' "$1"
}

fail() {
  failures=$((failures + 1))
  printf 'FAIL %s\n' "$1"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

check_equals() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label = $expected"
  else
    fail "$label expected $expected, got ${actual:-<empty>}"
  fi
}

printf 'Launch readiness for %s\n\n' "$DOMAIN"

if has_command curl; then
  rdap_status="$(curl -sS --max-time 15 "https://rdap.verisign.com/com/v1/domain/${DOMAIN}" || true)"
  if printf '%s' "$rdap_status" | grep -qi '"client hold"'; then
    fail "$DOMAIN is clientHold; complete real-name verification before HTTPS/TestFlight."
  elif printf '%s' "$rdap_status" | grep -qi '"ldhName"'; then
    pass "$DOMAIN RDAP lookup has no clientHold."
  else
    warn "$DOMAIN RDAP lookup did not return a recognizable response."
  fi
else
  warn "curl is unavailable; skipped RDAP and HTTPS checks."
fi

if has_command dig || has_command ssh; then
  if has_command ssh && ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" 'command -v dig >/dev/null' 2>/dev/null; then
    auth_api="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @dns11.hichina.com +short '$API_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
    auth_console="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @dns11.hichina.com +short '$CONSOLE_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
    public_api="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @8.8.8.8 +short '$API_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
    public_console="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @8.8.8.8 +short '$CONSOLE_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
  else
    auth_api="$(dig @dns11.hichina.com +short "$API_DOMAIN" A 2>/dev/null | tail -1)"
    auth_console="$(dig @dns11.hichina.com +short "$CONSOLE_DOMAIN" A 2>/dev/null | tail -1)"
    public_api="$(dig @8.8.8.8 +short "$API_DOMAIN" A 2>/dev/null | tail -1)"
    public_console="$(dig @8.8.8.8 +short "$CONSOLE_DOMAIN" A 2>/dev/null | tail -1)"
  fi
  check_equals "authoritative $API_DOMAIN" "$auth_api" "$EXPECTED_IP"
  check_equals "authoritative $CONSOLE_DOMAIN" "$auth_console" "$EXPECTED_IP"
  check_equals "public $API_DOMAIN" "$public_api" "$EXPECTED_IP"
  check_equals "public $CONSOLE_DOMAIN" "$public_console" "$EXPECTED_IP"
else
  warn "dig is unavailable; skipped DNS checks."
fi

if has_command curl; then
  if curl -fsS --max-time 10 "https://${API_DOMAIN}/api/health" >/dev/null 2>&1; then
    pass "HTTPS API health is reachable."
  else
    fail "HTTPS API health is not reachable at https://${API_DOMAIN}/api/health."
  fi
fi

if has_command ssh; then
  if ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" 'curl -fsS --max-time 8 http://127.0.0.1:4390/api/health >/dev/null' 2>/dev/null; then
    pass "server backend health is OK via SSH."
  else
    warn "could not verify server backend health via SSH host $REMOTE_HOST."
  fi

  oss_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "awk -F= '/^OSS_ACCESS_KEY_ID=|^OSS_ACCESS_KEY_SECRET=/ {print \$1 \"=\" (length(\$2)>0 ? \"set\" : \"empty\")}' /opt/projects/marvels-chat/app/deploy/miaoxun-prod.env" 2>/dev/null || true)"
  if printf '%s\n' "$oss_state" | grep -q 'OSS_ACCESS_KEY_ID=set' &&
    printf '%s\n' "$oss_state" | grep -q 'OSS_ACCESS_KEY_SECRET=set'; then
    pass "server OSS AccessKey variables are configured."
  else
    fail "server OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET are not both configured."
  fi

  geocoding_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "awk -F= '/^GEOCODING_PROVIDER=|^AMAP_WEB_SERVICE_KEY=|^MAP_TILE_URL_TEMPLATE=|^MAP_TILE_USER_AGENT=/ {print \$1 \"=\" (length(\$2)>0 ? (\$1 ~ /KEY|TEMPLATE/ ? \"set\" : \$2) : \"empty\")}' /opt/projects/marvels-chat/app/deploy/miaoxun-prod.env" 2>/dev/null || true)"
  if printf '%s\n' "$geocoding_state" | grep -q '^GEOCODING_PROVIDER=amap$' &&
    printf '%s\n' "$geocoding_state" | grep -q '^AMAP_WEB_SERVICE_KEY=set$'; then
    pass "server geocoding is configured with Amap."
  else
    fail "server geocoding is not production-ready; set GEOCODING_PROVIDER=amap and AMAP_WEB_SERVICE_KEY."
  fi
  if printf '%s\n' "$geocoding_state" | grep -q '^MAP_TILE_URL_TEMPLATE=set$' &&
    printf '%s\n' "$geocoding_state" | grep -q '^MAP_TILE_USER_AGENT=' &&
    ! printf '%s\n' "$geocoding_state" | grep -q '^MAP_TILE_USER_AGENT=empty$'; then
    pass "server map tile variables are configured."
  else
    fail "server MAP_TILE_URL_TEMPLATE / MAP_TILE_USER_AGENT are not both configured."
  fi
else
  warn "ssh is unavailable; skipped server checks."
fi

ios_plist="$PROJECT_ROOT/MiaoxunRN/ios/MiaoxunRN/Info.plist"
ios_project="$PROJECT_ROOT/MiaoxunRN/ios/MiaoxunRN.xcodeproj"
if has_command plutil && [ -f "$ios_plist" ]; then
  if plutil -lint "$ios_plist" >/dev/null; then
    pass "iOS Info.plist is valid."
  else
    fail "iOS Info.plist is invalid."
  fi
fi

if grep -q 'NSExceptionDomains' "$ios_plist" 2>/dev/null ||
  grep -q "$EXPECTED_IP" "$ios_plist" 2>/dev/null; then
  fail "iOS Info.plist still contains HTTP ATS exception settings."
else
  pass "iOS Info.plist has no public HTTP ATS exception."
fi

if has_command xcodebuild && [ -d "$ios_project" ]; then
  release_api="$(
    cd "$PROJECT_ROOT/MiaoxunRN" &&
      xcodebuild -showBuildSettings -project ios/MiaoxunRN.xcodeproj -scheme MiaoxunRN -configuration Release 2>/dev/null |
      awk -F= '/MIAOXUN_API_BASE_URL/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2; exit}'
  )"
  if printf '%s' "$release_api" | grep -Eq '^https://[^/]*[A-Za-z][^/]*'; then
    pass "iOS Release API base URL is $release_api."
  else
    fail "iOS Release API base URL is not an HTTPS domain: ${release_api:-<empty>}."
  fi
else
  warn "xcodebuild is unavailable; skipped iOS Release build setting check."
fi

if java -version >/dev/null 2>&1; then
  pass "Java runtime is available for Android Gradle checks."
else
  warn "Java runtime is unavailable; Android Gradle checks cannot run on this Mac."
fi

printf '\nSummary: %s failure(s), %s warning(s)\n' "$failures" "$warnings"

if [ "$failures" -gt 0 ]; then
  exit 1
fi
