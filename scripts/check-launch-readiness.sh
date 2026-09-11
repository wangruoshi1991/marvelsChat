#!/usr/bin/env bash

set -u

DOMAIN="${DOMAIN:-marvelschat.com}"
API_DOMAIN="${API_DOMAIN:-api.marvelschat.com}"
CONSOLE_DOMAIN="${CONSOLE_DOMAIN:-console.marvelschat.com}"
EXPECTED_IP="${EXPECTED_IP:-8.153.167.11}"
REMOTE_HOST="${REMOTE_HOST:-marvels-chat}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_ORIGIN="${MIAOXUN_RELEASE_API_ORIGIN:-https://${EXPECTED_IP}}"
CONSOLE_ORIGIN="${MIAOXUN_CONSOLE_ORIGIN:-https://${EXPECTED_IP}}"

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

check_domain_equals() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label = $expected"
  else
    warn "$label expected $expected, got ${actual:-<empty>}"
  fi
}

for origin in "$API_ORIGIN" "$CONSOLE_ORIGIN"; do
  if ! printf '%s' "$origin" | grep -Eq '^https://[^/?#]+/?$'; then
    printf 'FAIL release origins must be HTTPS origins without paths: %s\n' "$origin" >&2
    exit 2
  fi
done

release_profile="production-https"
expected_cors_origin="$CONSOLE_ORIGIN"

printf 'Launch readiness for %s (%s)\n\n' "$DOMAIN" "$release_profile"

if has_command curl; then
  rdap_status="$(curl -sS --max-time 15 "https://rdap.verisign.com/com/v1/domain/${DOMAIN}" || true)"
  if printf '%s' "$rdap_status" | grep -qi '"client hold"'; then
    warn "$DOMAIN is clientHold; the current release uses $API_ORIGIN instead."
  elif printf '%s' "$rdap_status" | grep -qi '"ldhName"'; then
    pass "$DOMAIN RDAP lookup has no clientHold."
  else
    warn "$DOMAIN RDAP lookup did not return a recognizable response."
  fi
else
  warn "curl is unavailable; skipped RDAP and HTTPS checks."
fi

if has_command ssh && ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" 'command -v dig >/dev/null' 2>/dev/null; then
  auth_api="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @dns11.hichina.com +short '$API_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
  auth_console="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @dns11.hichina.com +short '$CONSOLE_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
  public_api="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @8.8.8.8 +short '$API_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
  public_console="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "dig @8.8.8.8 +short '$CONSOLE_DOMAIN' A 2>/dev/null | tail -1" 2>/dev/null || true)"
  check_domain_equals "authoritative $API_DOMAIN" "$auth_api" "$EXPECTED_IP"
  check_domain_equals "authoritative $CONSOLE_DOMAIN" "$auth_console" "$EXPECTED_IP"
  check_domain_equals "public $API_DOMAIN" "$public_api" "$EXPECTED_IP"
  check_domain_equals "public $CONSOLE_DOMAIN" "$public_console" "$EXPECTED_IP"
elif has_command dig; then
  auth_api="$(dig @dns11.hichina.com +short "$API_DOMAIN" A 2>/dev/null | tail -1)"
  auth_console="$(dig @dns11.hichina.com +short "$CONSOLE_DOMAIN" A 2>/dev/null | tail -1)"
  public_api="$(dig @8.8.8.8 +short "$API_DOMAIN" A 2>/dev/null | tail -1)"
  public_console="$(dig @8.8.8.8 +short "$CONSOLE_DOMAIN" A 2>/dev/null | tail -1)"
  check_domain_equals "authoritative $API_DOMAIN" "$auth_api" "$EXPECTED_IP"
  check_domain_equals "authoritative $CONSOLE_DOMAIN" "$auth_console" "$EXPECTED_IP"
  check_domain_equals "public $API_DOMAIN" "$public_api" "$EXPECTED_IP"
  check_domain_equals "public $CONSOLE_DOMAIN" "$public_console" "$EXPECTED_IP"
else
  warn "dig is unavailable; skipped DNS checks."
fi

if has_command curl; then
  if curl -fsS --max-time 10 "${API_ORIGIN%/}/api/health" >/dev/null 2>&1; then
    pass "HTTPS API health is reachable at $API_ORIGIN."
  else
    fail "HTTPS API health is not reachable at ${API_ORIGIN%/}/api/health."
  fi
fi

if has_command ssh; then
  if ! ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" 'true' 2>/dev/null; then
    warn "could not verify server configuration via SSH host $REMOTE_HOST."
  else
    health_status="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" 'curl -sS --max-time 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:4390/api/health || true' 2>/dev/null)"
    if [ "$health_status" = "200" ]; then
      pass "server backend liveness is OK via SSH."
    else
      fail "server backend liveness returned HTTP ${health_status:-<empty>} via SSH."
    fi
    readiness_status="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" 'curl -sS --max-time 8 -o /dev/null -w "%{http_code}" http://127.0.0.1:4390/api/ready || true' 2>/dev/null)"
    if [ "$readiness_status" = "200" ]; then
      pass "server backend readiness is OK via SSH."
    elif [ "$readiness_status" = "404" ]; then
      fail "server /api/ready is not deployed."
    else
      fail "server backend readiness returned HTTP ${readiness_status:-<empty>}; verify PostgreSQL and schema migrations."
    fi

    certificate_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "
      if systemctl is-active --quiet miaoxun-ip-cert-renew.timer &&
        systemctl is-enabled --quiet miaoxun-ip-cert-renew.timer &&
        openssl x509 -checkend 172800 -noout -in /etc/letsencrypt/live/${EXPECTED_IP}/fullchain.pem >/dev/null 2>&1 &&
        openssl x509 -noout -ext subjectAltName -in /etc/letsencrypt/live/${EXPECTED_IP}/fullchain.pem 2>/dev/null | grep -Fq 'IP Address:${EXPECTED_IP}'; then
        printf ready
      else
        printf invalid
      fi
    " 2>/dev/null || true)"
    if [ "$certificate_state" = "ready" ]; then
      pass "server IP certificate covers $EXPECTED_IP, remains valid for 48 hours, and has an active renewal timer."
    else
      fail "server IP certificate or miaoxun-ip-cert-renew.timer is not release-ready."
    fi

    production_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "awk -F= '/^NODE_ENV=|^TRUST_PROXY_HOPS=|^CORS_ORIGIN=|^CREATE_FIRST_USER_AS_ADMIN=|^ADMIN_EMAILS=|^DEFAULT_ADMIN_ENABLED=/ {value=substr(\$0,index(\$0,\"=\")+1); gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, \"\", value); print \$1 \"=\" (length(value)>0 ? value : \"empty\")}' /opt/projects/marvels-chat/app/deploy/miaoxun-prod.env" 2>/dev/null || true)"
    for expected_setting in \
      'NODE_ENV=production' \
      'TRUST_PROXY_HOPS=1' \
      "CORS_ORIGIN=${expected_cors_origin}" \
      'CREATE_FIRST_USER_AS_ADMIN=false' \
      'ADMIN_EMAILS=empty' \
      'DEFAULT_ADMIN_ENABLED=false'; do
      if printf '%s\n' "$production_state" | grep -Fxq "$expected_setting"; then
        pass "server $expected_setting."
      else
        fail "server production guard is missing: $expected_setting."
      fi
    done

    oss_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "awk -F= '/^OSS_ACCESS_KEY_ID=|^OSS_ACCESS_KEY_SECRET=/ {value=substr(\$0,index(\$0,\"=\")+1); gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, \"\", value); print \$1 \"=\" (length(value)>0 ? \"set\" : \"empty\")}' /opt/projects/marvels-chat/app/deploy/miaoxun-prod.env" 2>/dev/null || true)"
    if printf '%s\n' "$oss_state" | grep -q 'OSS_ACCESS_KEY_ID=set' &&
      printf '%s\n' "$oss_state" | grep -q 'OSS_ACCESS_KEY_SECRET=set'; then
      pass "server OSS AccessKey variables are configured."
    else
      fail "server OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET are not both configured."
    fi

    avatar_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "awk -F= '/^AVATAR_3D_ENABLED=|^AVATAR_3D_PROVIDER_CALLS_ENABLED=/ {value=substr(\$0,index(\$0,\"=\")+1); gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, \"\", value); print \$1 \"=\" value} /^AVATAR_3D_ALLOWLIST=|^DASHSCOPE_API_KEY=|^DASHSCOPE_WORKSPACE_ID=/ {value=substr(\$0,index(\$0,\"=\")+1); gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, \"\", value); print \$1 \"=\" (length(value)>0 ? \"set\" : \"empty\")}' /opt/projects/marvels-chat/app/deploy/miaoxun-prod.env" 2>/dev/null || true)"
    if printf '%s\n' "$avatar_state" | grep -q '^AVATAR_3D_ENABLED=true$'; then
      pass "server 3D feature is enabled."
      for expected_setting in \
        'AVATAR_3D_PROVIDER_CALLS_ENABLED=true' \
        'AVATAR_3D_ALLOWLIST=set' \
        'DASHSCOPE_API_KEY=set' \
        'DASHSCOPE_WORKSPACE_ID=set'; do
        if printf '%s\n' "$avatar_state" | grep -Fxq "$expected_setting"; then
          pass "server $expected_setting."
        else
          fail "enabled 3D generation is missing: $expected_setting."
        fi
      done
    else
      warn "server 3D feature is disabled; generation will not be available."
    fi

    geocoding_state="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE_HOST" "awk -F= '/^GEOCODING_PROVIDER=/ {value=substr(\$0,index(\$0,\"=\")+1); gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, \"\", value); print \$1 \"=\" (length(value)>0 ? value : \"empty\")} /^AMAP_WEB_SERVICE_KEY=/ {value=substr(\$0,index(\$0,\"=\")+1); gsub(/^[[:space:]\"]+|[[:space:]\"]+$/, \"\", value); print \$1 \"=\" (length(value)>0 ? \"set\" : \"empty\")}' /opt/projects/marvels-chat/app/deploy/miaoxun-prod.env" 2>/dev/null || true)"
    if printf '%s\n' "$geocoding_state" | grep -q '^GEOCODING_PROVIDER=amap$' &&
      printf '%s\n' "$geocoding_state" | grep -q '^AMAP_WEB_SERVICE_KEY=set$'; then
      pass "server geocoding is configured with Amap."
    else
      fail "server geocoding is not production-ready; set GEOCODING_PROVIDER=amap and AMAP_WEB_SERVICE_KEY."
    fi
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

ats_arbitrary="$(/usr/libexec/PlistBuddy -c 'Print :NSAppTransportSecurity:NSAllowsArbitraryLoads' "$ios_plist" 2>/dev/null || true)"
if [ "$ats_arbitrary" != "false" ]; then
  fail "iOS NSAllowsArbitraryLoads must remain false."
elif grep -q 'NSExceptionDomains' "$ios_plist" 2>/dev/null; then
  fail "iOS Info.plist still contains HTTP ATS exception settings."
else
  pass "iOS ATS allows no arbitrary or exception-domain HTTP loads."
fi

if has_command xcodebuild && [ -d "$ios_project" ]; then
  release_settings="$(
    cd "$PROJECT_ROOT/MiaoxunRN" &&
      xcodebuild -showBuildSettings -project ios/MiaoxunRN.xcodeproj -scheme MiaoxunRN -configuration Release 2>/dev/null
  )"
  release_api="$(printf '%s\n' "$release_settings" | awk -F= '/MIAOXUN_API_BASE_URL/ {gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2; exit}')"
  if [ "$release_api" = "$API_ORIGIN" ]; then
    pass "iOS Release API base URL is $release_api."
  else
    fail "iOS Release must use $API_ORIGIN; got ${release_api:-<empty>}."
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
