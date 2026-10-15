#!/usr/bin/env bash
set -euo pipefail

if [ "${CONFIGURATION:?Xcode CONFIGURATION is required}" != "Release" ]; then
  exit 0
fi

# Use the same explicit Node configuration as the React Native bundle phase.
. "${SRCROOT:?Xcode SRCROOT is required}/.xcode.env"
if [ -f "$SRCROOT/.xcode.env.local" ]; then
  . "$SRCROOT/.xcode.env.local"
fi
if [ -z "${NODE_BINARY:-}" ] || [ ! -x "$NODE_BINARY" ]; then
  printf 'error: Set NODE_BINARY to an executable Node.js path in ios/.xcode.env or ios/.xcode.env.local.\n' >&2
  exit 1
fi

"$NODE_BINARY" "$SRCROOT/../../scripts/validate-release-api-origin.mjs" --env MIAOXUN_API_BASE_URL
