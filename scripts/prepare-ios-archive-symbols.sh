#!/bin/bash
set -euo pipefail

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ] || [ ! -d "$1/Products/Applications" ]; then
  fail "Usage: bash $0 <App.xcarchive> [symbol-download-directory]"
fi

archive=$(cd "$1" && pwd)
work=$(mktemp -d "${TMPDIR:-/tmp}/miaoxun-ios-symbols.XXXXXXXX")
trap 'rm -rf "$work"' EXIT
downloads=${2:-"$work/downloads"}
mkdir -p "$downloads" "$work/staged"
official_repo=https://repo.reactnative.dev/maven2/com/facebook

uuid_set() {
  xcrun dwarfdump --uuid "$1" | awk '/^UUID:/ { print $3, $2 }' | LC_ALL=C sort -u
}

verify_symbols() {
  local uuid="$1"
  local symbols="$2"
  local found
  [ -d "$symbols" ] || fail "Missing dSYM: $symbols"
  found=$(uuid_set "$symbols")
  [ "$found" = "$uuid" ] || fail "Unexpected dSYM UUIDs: $symbols"
}

stage_framework_symbols() {
  local name="$1"
  local uuid="$2"
  local dependency_path="$3"
  local member="$4"
  local expected_sha="$5"
  local package="$downloads/${dependency_path##*/}"
  local actual_sha
  if [ ! -f "$package" ]; then
    curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 1200 --retry 2 \
      --output "$work/download.tar.gz" "$official_repo/$dependency_path"
    actual_sha=$(shasum -a 256 "$work/download.tar.gz" | awk '{print $1}')
    [ "$actual_sha" = "$expected_sha" ] || fail "Unexpected symbol package checksum: $name"
    mv "$work/download.tar.gz" "$package"
  else
    actual_sha=$(shasum -a 256 "$package" | awk '{print $1}')
    [ "$actual_sha" = "$expected_sha" ] || fail "Unexpected cached symbol package checksum: $package"
  fi
  tar -xzf "$package" -C "$work" "$member"
  verify_symbols "$uuid" "$work/$member"
  mv "$work/$member" "$work/staged/"
}

apps=("$archive"/Products/Applications/*.app)
[ "${#apps[@]}" -eq 1 ] && [ -d "${apps[0]}" ] || fail "Expected one archived iOS app"
app=${apps[0]}
app_binary=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")
app_uuid=$(uuid_set "$app/$app_binary")
[ -n "$app_uuid" ] || fail "No Mach-O UUIDs for $app_binary"
verify_symbols "$app_uuid" "$archive/dSYMs/${app##*/}.dSYM"
printf '%s dSYM matched (%s)\n' "$app_binary" "$app_uuid"

# Prebuilt iOS package versions are locked in MiaoxunRN/ios/Podfile.lock.
react_artifacts=react/react-native-artifacts/0.87.1/react-native-artifacts-0.87.1
for framework in "$app"/Frameworks/*.framework; do
  [ -d "$framework" ] || continue
  name=${framework##*/}
  binary=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$framework/Info.plist")
  uuid=$(uuid_set "$framework/$binary")
  [ -n "$uuid" ] || fail "No Mach-O UUIDs for $name"
  if [ -e "$archive/dSYMs/$name.dSYM" ]; then
    verify_symbols "$uuid" "$archive/dSYMs/$name.dSYM"
  else
    case "$name" in
      React.framework)
        stage_framework_symbols "$name" "$uuid" "$react_artifacts-reactnative-core-dSYM-release.tar.gz" \
          "./ios-arm64/$name.dSYM" 13be5ccced7d0b2b062b8cebc142c55860604cb47687bdc0db9c04f0da0cdbfe
        ;;
      ReactNativeDependencies.framework)
        stage_framework_symbols "$name" "$uuid" "$react_artifacts-reactnative-dependencies-dSYM-release.tar.gz" \
          "./ios-arm64/$name.dSYM" 58848fd9a97fb9bc6f1ce28583b3acc23ee1654842f1ca9d26e2120249d79fd8
        ;;
      hermesvm.framework)
        stage_framework_symbols "$name" "$uuid" \
          hermes/hermes-ios/250829098.0.17/hermes-ios-250829098.0.17-hermes-framework-dSYM-release.tar.gz \
          "./iphoneos/$name.dSYM" 5cea3dd57ecadb42c40d1cc8acf2e178dbfbe6a230410742d997ff3fe313a9c0
        ;;
      *) fail "No dSYM for $name. Add a matching dSYM to the archive and re-run." ;;
    esac
  fi
  printf '%s dSYM matched (%s)\n' "$name" "$uuid"
done

for symbols in "$work"/staged/*.dSYM; do
  [ -d "$symbols" ] || continue
  ditto "$symbols" "$archive/dSYMs/${symbols##*/}"
done
