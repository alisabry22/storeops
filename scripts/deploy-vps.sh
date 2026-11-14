#!/usr/bin/env bash
# Deploy StoreOps to the production VPS in one command.
#
#   npm run deploy                     # deploy the commit you have checked out
#   npm run deploy -- --ref <commit>   # deploy a specific pushed commit
#   npm run deploy -- --skip-checks    # skip local typecheck/lint/tests
#   npm run deploy -- --rollback       # restore the previous production image
#   npm run deploy -- --status         # show what's running and health-check it
#
# The commit must already be on GitHub: the VPS fetches it from its own git
# checkout, so only the changed files travel. Override the SSH host with
# STOREOPS_DEPLOY_HOST (default: contabo-gateway).
set -euo pipefail

HOST="${STOREOPS_DEPLOY_HOST:-contabo-gateway}"
REF=HEAD
CHECKS=1
ACTION=deploy

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF="${2:?--ref needs a commit}"; shift 2 ;;
    --skip-checks) CHECKS=0; shift ;;
    --rollback) ACTION=rollback; shift ;;
    --status) ACTION=status; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"
REMOTE_SCRIPT=deploy/vps/remote-deploy.sh
REMOTE_PATH=/srv/storeops-production/remote-deploy.sh

# Upload the script first, then run it, so nothing inside it can consume the
# script itself from stdin.
remote() {
  ssh -o BatchMode=yes "$HOST" "cat > $REMOTE_PATH && chmod 700 $REMOTE_PATH && $REMOTE_PATH $*" < "$REMOTE_SCRIPT"
}

if [ "$ACTION" != deploy ]; then
  remote "$ACTION"
  exit
fi

SHA="$(git rev-parse --verify "$REF^{commit}")"

if [ "$REF" = HEAD ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "You have uncommitted changes. Commit and push them first (deploys always use a pushed commit)." >&2
  exit 1
fi

echo "==> Checking that ${SHA:0:7} is on GitHub"
git fetch --quiet origin
if [ -z "$(git branch -r --contains "$SHA" 2>/dev/null)" ]; then
  echo "Commit ${SHA:0:7} is not pushed. Run: git push origin $(git rev-parse --abbrev-ref HEAD)" >&2
  exit 1
fi

if [ "$CHECKS" = 1 ]; then
  if [ "$SHA" = "$(git rev-parse HEAD)" ]; then
    echo "==> Typecheck, lint, tests"
    npx tsc --noEmit -p .
    npx eslint src
    npx vitest run --reporter=dot
  else
    echo "==> Skipping local checks: --ref differs from your checkout"
  fi
fi

echo "==> Deploying ${SHA:0:7} ($(git log -1 --format=%s "$SHA")) to $HOST"
remote deploy "$SHA"
