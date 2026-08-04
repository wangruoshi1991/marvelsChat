#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
viewer_output_dir="$(mktemp -d)"
trap 'rm -rf "$viewer_output_dir"' EXIT

run_in() {
  local project="$1"
  shift
  printf '\n==> %s: %s\n' "$project" "$*"
  (
    cd "$root_dir/$project"
    "$@"
  )
}

git -C "$root_dir" diff --check

printf '\n==> repository: npm run lint\n'
npm --prefix "$root_dir" run lint

run_in backend npm run check
run_in backend npm test

run_in agents npm run check
run_in agents npm test

run_in admin npm run check
run_in admin npm test
run_in admin npm run build

run_in avatar-web npm run typecheck
run_in avatar-web npm test
run_in avatar-web npm run build
printf '\n==> avatar-web: build embedded App viewer\n'
(
  cd "$root_dir/avatar-web"
  MIAOXUN_APP_VIEWER_OUT_DIR="$viewer_output_dir" npm run build:app-viewer
)
cmp \
  "$viewer_output_dir/avatar-viewer.html" \
  "$root_dir/MiaoxunRN/src/assets/avatar-viewer/avatar-viewer.html"

run_in MiaoxunRN npm run format:check
run_in MiaoxunRN npm run lint -- --max-warnings=0
run_in MiaoxunRN npm run typecheck
run_in MiaoxunRN npm test -- --runInBand

printf '\nAll repository checks passed.\n'
