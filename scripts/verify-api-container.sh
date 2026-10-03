#!/usr/bin/env bash
#
# Production container verification gate (Issue #57).
#
# Proves the Docker image this repository ships is actually deployable:
#   1. builds both stages from the repository root;
#   2. runs the AUTHORITATIVE production migration command inside the image
#      against a disposable PostgreSQL;
#   3. boots the resulting image with production-style configuration;
#   4. proves /health and /health/deep with a real database round trip;
#   5. proves the Display route surface is registered and auth-protected;
#   6. proves graceful SIGTERM shutdown;
#   7. proves no production secret is baked into the image.
#
# Uses disposable credentials only. No real provider or production database
# secret is used or required.
#
# Usage: bash scripts/verify-api-container.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_TAG="ttsdata-api:verify"
NETWORK="ttsdata-verify-net"
PG_CONTAINER="ttsdata-verify-pg"
APP_CONTAINER="ttsdata-verify-app"

PG_USER="verify"
PG_PASSWORD="verify-only-password"
PG_DATABASE="ttsdata_verify_test"
APP_PORT=4199

# Disposable application configuration. These are test values, not secrets.
TEST_AUTH_SECRET="$(openssl rand -hex 32)"
TEST_TIKTOK_SECRET="$(openssl rand -hex 16)"
TEST_STATE_SECRET="$(openssl rand -hex 32)"
TEST_SESSION_SECRET="$(openssl rand -hex 32)"
TEST_DISPLAY_KEY="$(openssl rand -base64 32)"

cleanup() {
  docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "  ok  $*"; }

echo "1/8 Building the production image from the repository root..."
docker build -f "$REPO_ROOT/apps/api/Dockerfile" -t "$IMAGE_TAG" "$REPO_ROOT" >/dev/null
pass "image built (both stages): $IMAGE_TAG"

echo "2/8 Starting disposable PostgreSQL..."
docker network create "$NETWORK" >/dev/null 2>&1 || true
docker run -d --name "$PG_CONTAINER" --network "$NETWORK" \
  -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$PG_DATABASE" \
  postgres:16-alpine >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DATABASE" >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DATABASE" >/dev/null 2>&1 \
  || fail "disposable PostgreSQL did not become ready"
pass "postgres ready"

DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_CONTAINER}:5432/${PG_DATABASE}"

echo "3/8 Proving the documented production migration command runs inside the image..."
# The authoritative production migration command. If this executable is absent
# from the image the gate fails here, which is the whole point.
if ! docker run --rm --network "$NETWORK" -w /repo -e DATABASE_URL="$DATABASE_URL" \
      "$IMAGE_TAG" node packages/db/dist/src/migrate.js; then
  fail "production migration command failed inside the image"
fi
TABLE_COUNT="$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DATABASE" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
[ "$TABLE_COUNT" -gt 0 ] || fail "migration reported success but created no tables"
pass "migrate.js ran in-image; ${TABLE_COUNT} tables created"

echo "4/8 Booting the exact image with production configuration..."
docker run -d --name "$APP_CONTAINER" --network "$NETWORK" -p "${APP_PORT}:4000" \
  -e NODE_ENV=production \
  -e PORT=4000 -e HOST=0.0.0.0 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e AUTH_SECRET="$TEST_AUTH_SECRET" \
  -e ALLOWED_ORIGINS="https://ttsdata.netlify.app" \
  -e API_ORIGIN="https://api.ttsdata.example" \
  -e TIKTOK_CLIENT_KEY="verify-client-key" \
  -e TIKTOK_CLIENT_SECRET="$TEST_TIKTOK_SECRET" \
  -e NEXT_PUBLIC_TIKTOK_REDIRECT_URI="https://api.ttsdata.example/api/display/callback" \
  -e OAUTH_CANONICAL_ORIGIN="https://api.ttsdata.example" \
  -e OAUTH_STATE_SECRET="$TEST_STATE_SECRET" \
  -e OAUTH_SESSION_SECRET="$TEST_SESSION_SECRET" \
  -e DISPLAY_CREDENTIAL_KEYS="{\"1\":\"${TEST_DISPLAY_KEY}\"}" \
  -e DISPLAY_CREDENTIAL_VERSION=1 \
  "$IMAGE_TAG" >/dev/null

READY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done
[ "$READY" = "1" ] || { docker logs "$APP_CONTAINER" 2>&1 | tail -30; fail "container did not become healthy"; }
pass "container booted"

echo "5/8 Proving health and readiness with a real database round trip..."
HEALTH="$(curl -fsS "http://127.0.0.1:${APP_PORT}/health")"
echo "$HEALTH" | grep -q '"database":"connected"' || fail "/health did not report a connected database: $HEALTH"
pass "/health -> $HEALTH"

DEEP="$(curl -fsS "http://127.0.0.1:${APP_PORT}/health/deep")"
echo "$DEEP" | grep -q '"database":"ok"' || fail "/health/deep did not report database ok: $DEEP"
pass "/health/deep -> $DEEP"

echo "6/8 Proving the Display route surface is registered and auth-protected..."
DISPLAY_STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/api/display/connections")"
[ "$DISPLAY_STATUS" = "401" ] || fail "expected 401 from the Display route (404 would mean it is not deployed), got $DISPLAY_STATUS"
pass "/api/display/connections -> 401 (registered, auth enforced)"

echo "7/8 Proving graceful SIGTERM shutdown..."
docker stop -t 20 "$APP_CONTAINER" >/dev/null
EXIT_CODE="$(docker inspect -f '{{.State.ExitCode}}' "$APP_CONTAINER")"
[ "$EXIT_CODE" = "0" ] || { docker logs "$APP_CONTAINER" 2>&1 | tail -20; fail "container exited $EXIT_CODE on SIGTERM, expected 0"; }
pass "SIGTERM -> exit 0 (graceful)"

echo "8/8 Proving no production secret is baked into the image..."
# Scan the image filesystem and its config for the disposable secrets. If any
# appear, the image is baking credentials and must not ship.
SCAN="$(docker run --rm --entrypoint sh "$IMAGE_TAG" -c \
  "grep -rlF '${TEST_AUTH_SECRET}' /repo 2>/dev/null | head -5; \
   grep -rlF '${TEST_TIKTOK_SECRET}' /repo 2>/dev/null | head -5; \
   grep -rlF '${TEST_DISPLAY_KEY}' /repo 2>/dev/null | head -5" || true)"
[ -z "$SCAN" ] || fail "a test secret was found baked into the image: $SCAN"

ENV_LEAK="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$IMAGE_TAG" | grep -E "AUTH_SECRET|TIKTOK_CLIENT_SECRET|DISPLAY_CREDENTIAL_KEYS" || true)"
[ -z "$ENV_LEAK" ] || fail "the image config declares a secret env var: $ENV_LEAK"

# The runtime image must not carry TypeScript source tooling it does not need.
docker run --rm --entrypoint sh "$IMAGE_TAG" -c 'test ! -e /repo/packages/db/src/migrate.ts' \
  || fail "runtime image still carries the TypeScript migration source"
pass "no test secret in the image; runtime image carries compiled JS only"

echo
echo "Production container verification passed."
