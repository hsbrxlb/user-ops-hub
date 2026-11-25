#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
gate=scripts/check-artifact-copy.py
if [[ ! -f $gate ]]; then
  gate=$(git config --path --get hub.copyGate || true)
fi
if [[ ! -f $gate ]]; then
  echo 'Set git config --local hub.copyGate /absolute/path/to/check-artifact-copy.py to use the local copy checker.' >&2
  exit 1
fi
copy=(python3 -B "$gate" --allowlist "$(dirname "$gate")/artifact-copy-allowlist.json")
judge=$(git config --get artifactCopy.judge || true)
if [[ -n $judge ]]; then copy+=(--judge "$judge"); fi

scratch=$(mktemp -d "${TMPDIR:-/tmp}/hub-qa.XXXXXXXX")
work=$(mktemp -d "${TMPDIR:-/tmp}/hub-qa-work.XXXXXXXX")
cleanup() {
  for d in "$scratch" "$work"; do
    if [[ $(uname) == Darwin && -d "$HOME/.Trash" ]]; then
      mv "$d" "$HOME/.Trash/"
    else
      rm -rf "$d"
    fi
  done
}
trap cleanup EXIT
root=$PWD
changed_light=1
if [[ $# == 0 ]]; then
  # Auto-shrink public images over the size limit (originals go to build-artifacts/originals, git-ignored).
  python3 -B scripts/compress-public-images.py
  git diff --quiet refs/remotes/origin/main -- apps/light-research 2>/dev/null && changed_light=0
elif [[ $# == 2 ]]; then
  git diff --quiet "$1" "$2" -- apps/light-research 2>/dev/null && changed_light=0
else
  echo 'Usage: scripts/qa-local.sh [base tip]' >&2
  exit 2
fi
[[ ${LIGHT_RESEARCH_QA:-auto} == all ]] && changed_light=1
[[ -d apps/light-research ]] || changed_light=0

# Independent gates run in parallel; logs appear only for failures.
copy_gate() {
  if [[ $# == 2 ]]; then
    "${copy[@]}" --range "$1" "$2"
  else
    "${copy[@]}" --staged
    "${copy[@]}" --range refs/remotes/origin/main HEAD
  fi
}
light_research() {
  cd "$1/apps/light-research"
  # Cache node_modules by lockfile + node version (APFS clone copy) to skip npm ci.
  key=$(cat package-lock.json | shasum -a 256 | cut -c1-16)-$(node -p process.versions.node)
  cache="$HOME/.cache/hub-qa/node_modules-$key"
  if [[ -d $cache ]]; then
    cp -Rc "$cache" node_modules 2>/dev/null || cp -R "$cache" node_modules
  else
    npm ci --silent
    mkdir -p "$HOME/.cache/hub-qa"
    cp -Rc node_modules "$cache.tmp.$$" 2>/dev/null || cp -R node_modules "$cache.tmp.$$"
    mv "$cache.tmp.$$" "$cache" 2>/dev/null || rm -rf "$cache.tmp.$$"
  fi
  npm test >"$2/lr-test.log" 2>&1 & t=$!
  npm run lint >"$2/lr-lint.log" 2>&1 & l=$!
  rc=0
  npm run build -- --webpack || rc=1
  wait $t || { cat "$2/lr-test.log"; rc=1; }
  wait $l || { cat "$2/lr-lint.log"; rc=1; }
  [[ $rc == 0 ]] && npm run typecheck || rc=1
  return $rc
}
jobs_dir="$work/jobs"
mkdir -p "$jobs_dir"
if [[ $# == 2 ]]; then
  ( copy_gate "$1" "$2" ) >"$jobs_dir/copy.log" 2>&1 & copy_pid=$!
else
  ( copy_gate ) >"$jobs_dir/copy.log" 2>&1 & copy_pid=$!
fi
if [[ $# == 2 ]]; then
  git archive "$2" | tar -x -C "$scratch"
  srcdir=$scratch
else
  srcdir=$root
fi
( cd "$srcdir" && bash scripts/check-site.sh "$scratch/public-dist" ) >"$jobs_dir/site.log" 2>&1 & site_pid=$!
light_pid=
if [[ $changed_light == 1 ]]; then
  # Run against a clean copy so the working tree gets no build output.
  lr_src=$work/lr-src
  mkdir -p "$lr_src/apps"
  rsync -a --exclude=node_modules --exclude='.next*' "$srcdir/apps/light-research" "$lr_src/apps/"
  ( light_research "$lr_src" "$jobs_dir" ) >"$jobs_dir/light.log" 2>&1 & light_pid=$!
fi
fail=0
wait "$copy_pid" || { fail=1; cat "$jobs_dir/copy.log" >&2; }
wait "$site_pid" || { fail=1; cat "$jobs_dir/site.log" >&2; }
if [[ -n $light_pid ]]; then wait "$light_pid" || { fail=1; cat "$jobs_dir/light.log" >&2; }; fi
[[ $fail == 0 ]] || { echo 'Local Hub QA failed.' >&2; exit 1; }
[[ -z $light_pid ]] && echo 'apps/light-research unchanged from base: skipped its build and tests (LIGHT_RESEARCH_QA=all forces them).'
echo "Local Hub QA passed in ${SECONDS}s."
