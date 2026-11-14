#!/usr/bin/env bash
# Runs ON the VPS, sent over SSH by scripts/deploy-vps.sh. Do not run locally.
#
#   remote-deploy.sh deploy <full-commit-sha>
#   remote-deploy.sh rollback
#   remote-deploy.sh status
#
# Builds the commit from a dedicated git checkout, switches the production
# container, health-checks it, and restores the previous image on failure.
# Secrets stay in .env.production; only NEXT_PUBLIC_ values reach the build.
set -euo pipefail

ACTION="${1:-}"
SHA="${2:-}"
ROOT=/srv/storeops-production
REPO="$ROOT/repo"
REPO_URL=https://github.com/alisabry22/storeops.git
PROJECT=storeops-production
CONTAINER=storeops-production-candidate
SITE=https://www.storeops.dev
RESOLVE=(--resolve www.storeops.dev:443:127.0.0.1)
KEEP_IMAGES=3

log() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
http() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${RESOLVE[@]}" "$@" || echo 000; }

expect() { # expect <label> <wanted-code> <curl args...>
  local label="$1" want="$2"; shift 2
  local got; got="$(http "$@")"
  if [ "$got" = "$want" ]; then printf '    ok   %-28s %s\n' "$label" "$got"
  else printf '    FAIL %-28s got %s, want %s\n' "$label" "$got" "$want"; return 1; fi
}

health_check() {
  log "Waiting for the app to answer"
  local i code=000
  for i in $(seq 1 45); do
    code="$(http "$SITE/")"; [ "$code" = 200 ] && break; sleep 2
  done
  [ "$code" = 200 ] || { echo "    FAIL home page never returned 200 (last: $code)"; return 1; }
  local probe=(-X PATCH -H 'X-Store-Authorization: Bearer deploy-check' -H 'Content-Type: application/json' -d '{}')
  local ok=0
  expect "home" 200 "$SITE/" || ok=1
  expect "connect" 200 "$SITE/connect" || ok=1
  expect "google play" 200 "$SITE/play" || ok=1
  expect "account (anonymous)" 401 "$SITE/api/me" || ok=1
  expect "apple write gate" 403 "${probe[@]}" "$SITE/api/asc/v1/subscriptions/deploy-check" || ok=1
  expect "google write gate" 403 "${probe[@]}" "$SITE/api/gp/androidpublisher/v3/applications/deploy.check/subscriptions/deploy-check" || ok=1
  expect "webhook bad signature" 401 -X POST -H 'X-Signature: bad' -H 'Content-Type: application/json' -d '{}' "$SITE/api/webhooks/lemonsqueezy" || ok=1
  expect "demo video (nginx)" 206 -H 'Range: bytes=0-9' "$SITE/storeops-demo-web.mp4" || ok=1
  return "$ok"
}

compose_up() {
  cd "$ROOT"
  docker compose -p "$PROJECT" config --quiet
  docker compose -p "$PROJECT" up -d 2>&1 | sed 's/^/    /'
}

current_image() { docker inspect -f '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || echo none; }

case "$ACTION" in
  status)
    log "Running image: $(current_image)"
    [ -f "$ROOT/deployments.log" ] && { log "Recent deployments"; tail -n 5 "$ROOT/deployments.log"; }
    health_check
    ;;

  rollback)
    [ -f "$ROOT/compose.yaml.prev" ] || fail "No previous deployment recorded (compose.yaml.prev missing)."
    log "Rolling back from $(current_image) to $(grep -E '^\s+image:' "$ROOT/compose.yaml.prev" | awk '{print $2}')"
    cp "$ROOT/compose.yaml" "$ROOT/compose.yaml.rolled-back"
    cp "$ROOT/compose.yaml.prev" "$ROOT/compose.yaml"
    compose_up
    health_check
    echo "$(date -u +%FT%TZ) rollback image=$(current_image)" >> "$ROOT/deployments.log"
    log "Rolled back."
    ;;

  deploy)
    [[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "deploy needs a full 40-character commit SHA."
    TAG="storeops-production:${SHA:0:7}"

    log "Checking out $SHA"
    if [ ! -d "$REPO/.git" ]; then git clone --quiet "$REPO_URL" "$REPO"; fi
    cd "$REPO"
    git fetch --quiet --prune origin
    git checkout --quiet --force --detach "$SHA"
    git clean -fdxq
    [ "$(git rev-parse HEAD)" = "$SHA" ] || fail "Checkout did not land on $SHA."

    if docker image inspect "$TAG" >/dev/null 2>&1; then
      log "Image $TAG already built; reusing it"
    else
      log "Building $TAG"
      ENVF="$(mktemp /root/storeops-public-env.XXXXXX)"; chmod 600 "$ENVF"
      trap 'rm -f "$ENVF"' EXIT
      grep -E '^NEXT_PUBLIC_' "$ROOT/.env.production" | grep -v '^NEXT_PUBLIC_SITE_URL=' > "$ENVF"
      echo "NEXT_PUBLIC_SITE_URL=$SITE" >> "$ENVF"
      BUILD_LOG="$ROOT/build-${SHA:0:7}.log"
      if ! DOCKER_BUILDKIT=1 docker build --progress=plain \
          --secret id=storeops_public_env,src="$ENVF" \
          --build-arg NEXT_PUBLIC_STOREOPS_EDITION=cloud \
          --build-arg NEXT_PUBLIC_SITE_URL="$SITE" \
          -t "$TAG" . > "$BUILD_LOG" 2>&1; then
        tail -n 40 "$BUILD_LOG"
        fail "Build failed (full log: $BUILD_LOG). Production was not touched."
      fi
      rm -f "$ENVF"
    fi

    PREV="$(current_image)"
    [ "$PREV" = "$TAG" ] && log "Production already runs $TAG; restarting it"
    cd "$ROOT"
    cp compose.yaml compose.yaml.prev
    sed -i -E "s|^(    image: ).*|\1$TAG|" compose.yaml
    log "Switching production: $PREV -> $TAG"
    compose_up

    if ! health_check; then
      log "Health check failed. Restoring $PREV"
      cp compose.yaml compose.yaml.failed
      cp compose.yaml.prev compose.yaml
      compose_up
      health_check || true
      echo "$(date -u +%FT%TZ) FAILED sha=$SHA image=$TAG restored=$PREV" >> "$ROOT/deployments.log"
      fail "Deployment of ${SHA:0:7} failed and was rolled back."
    fi
    echo "$(date -u +%FT%TZ) deployed sha=$SHA image=$TAG previous=$PREV" >> "$ROOT/deployments.log"

    # Keep the newest few release images plus whatever is running or is the rollback target.
    docker images storeops-production --format '{{.Repository}}:{{.Tag}}' | tail -n +$((KEEP_IMAGES + 1)) | while read -r old; do
      [ "$old" = "$TAG" ] || [ "$old" = "$PREV" ] || docker rmi "$old" >/dev/null 2>&1 || true
    done
    log "Deployed ${SHA:0:7} to $SITE"
    ;;

  *) fail "Usage: remote-deploy.sh deploy <sha> | rollback | status" ;;
esac
