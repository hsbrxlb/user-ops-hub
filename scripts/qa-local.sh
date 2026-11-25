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
cleanup() {
  if [[ $(uname) == Darwin && -d "$HOME/.Trash" ]]; then
    mv "$scratch" "$HOME/.Trash/"
  else
    rm -rf "$scratch"
  fi
}
trap cleanup EXIT
if [[ $# == 0 ]]; then
  # Auto-shrink public images over the size limit (originals go to build-artifacts/originals, git-ignored).
  python3 -B scripts/compress-public-images.py
fi
if [[ $# == 2 ]]; then
  "${copy[@]}" --range "$1" "$2"
  # Test exactly the outgoing commit, even with a different branch checked out.
  git archive "$2" | tar -x -C "$scratch"
  cd "$scratch"
elif [[ $# == 0 ]]; then
  "${copy[@]}" --staged
  "${copy[@]}" --range refs/remotes/origin/main HEAD
else
  echo 'Usage: scripts/qa-local.sh [base tip]' >&2
  exit 2
fi
bash scripts/check-site.sh "$scratch/public-dist"
if [[ -d apps/light-research ]] && { [[ ${LIGHT_RESEARCH_QA:-auto} == all ]] || git diff --quiet refs/remotes/origin/main -- apps/light-research 2>/dev/null; [[ $? -ne 0 ]]; }; then
  (cd apps/light-research && npm ci --silent && npm run build -- --webpack && npm run typecheck && npm test && npm run lint)
fi
echo "Local Hub QA passed in ${SECONDS}s."
