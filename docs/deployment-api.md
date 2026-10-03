# Production deployment — apps/api

**Owner decision:** `apps/api` is an independently deployed backend service.
`apps/web` remains the Netlify-hosted frontend. The Display routes are NOT relocated
into Next.js.

Issue: #57 (TTS-DEP-01)

---

## Topology

```text
Browser
   │
   ▼
apps/web                    (Netlify — static/SSR frontend)
   │  HTTPS + credentials
   ▼
apps/api                    (container service — this document)
   │
   ├── PostgreSQL            (managed instance)
   ├── TikTok Display API    (open.tiktokapis.com, Bearer)
   ├── OAuth + encrypted credentials
   ├── display_sync_jobs
   └── future workers (#21+)
```

The service is **stateless**: all durable state lives in PostgreSQL. Any container
that can reach the database can serve traffic, so scaling and rolling deploys are
safe.

---

## Runtime requirements

| Requirement | Value |
|---|---|
| Runtime | Node.js **20** (repository `engines: >=20.0.0`; image pins `node:20-alpine`) |
| Framework | Fastify 4 |
| Port | `PORT` (default `4000`) |
| Bind address | `HOST` (default `0.0.0.0`; required in a container) |
| Database | PostgreSQL — `DATABASE_URL` |
| TLS | Terminated by the platform/reverse proxy. The service speaks HTTP behind it. |
| Proxy trust | `TRUSTED_PROXY_CIDRS` (comma-separated) so client IPs survive the proxy |

---

## Build and start

```bash
# Reproducible production build (workspace deps first, then the API)
pnpm --filter @ttsdata/api build:production     # → apps/api/dist/server.js

# Start
node apps/api/dist/server.js                    # or: pnpm --filter @ttsdata/api start

# Container (build from the repository ROOT so workspaces resolve)
docker build -f apps/api/Dockerfile -t ttsdata-api .
docker run --env-file .env.production -p 4000:4000 ttsdata-api
```

`build:production` builds `@ttsdata/shared`, `@ttsdata/data-quality` and `@ttsdata/db`
before compiling the API, because the API imports them at runtime. A plain `tsc`
against the API alone is not a production build.

---

## Environment contract

**Server-only. None of these may use a `NEXT_PUBLIC_` prefix.**

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` enables fail-closed validation |
| `PORT` | no | default `4000` |
| `HOST` | no | default `0.0.0.0` |
| `DATABASE_URL` | yes | PostgreSQL. Must not be localhost in production |
| `AUTH_SECRET` | yes | ≥32 chars, not a placeholder. Cookie signing |
| `ALLOWED_ORIGINS` | yes | Comma-separated https origins. **No wildcard** |
| `API_ORIGIN` | recommended | Public https origin of this API |
| `TRUSTED_PROXY_CIDRS` | recommended | Proxy CIDRs for correct client IPs |
| `LOG_LEVEL` | no | default `info` |
| `TIKTOK_CLIENT_KEY` | yes | Display client key (server-side) |
| `TIKTOK_CLIENT_SECRET` | yes | Display client secret |
| `NEXT_PUBLIC_TIKTOK_REDIRECT_URI` | yes | Must share the canonical origin. Name is legacy; value is server-consumed |
| `OAUTH_CANONICAL_ORIGIN` | yes | Canonical origin; redirect must match |
| `OAUTH_STATE_SECRET` | yes | ≥32 chars |
| `OAUTH_SESSION_SECRET` | yes | ≥32 chars |
| `DISPLAY_CREDENTIAL_KEYS` | yes | JSON keyring `{"<version>":"<base64 32-byte key>"}` |
| `DISPLAY_CREDENTIAL_VERSION` | yes | Active key version |

`ALLOW_LOCALHOST_DATABASE=true` exists **only** for packaging smoke tests against a
local database. Never set it in a real deployment.

### Fail-closed behaviour

The service refuses to boot on missing, placeholder, or unsafe configuration. Verified
by test: missing `DATABASE_URL`, placeholder `AUTH_SECRET`, short `AUTH_SECRET`,
non-PostgreSQL `DATABASE_URL`, localhost database in production, missing or wildcard
`ALLOWED_ORIGINS`, non-https origin, and localhost origin all abort startup.

---

## CORS / origin contract

`ALLOWED_ORIGINS` is an explicit allow-list. In production it is required, every entry
must be an absolute `https` URL, and wildcards and localhost are rejected. The browser
origin is echoed only when it matches the list; otherwise no
`Access-Control-Allow-Origin` header is returned.

`credentials: true` is enabled, which is why a wildcard is not permitted.

---

## TikTok callback contract

The Display lifecycle lives in `apps/api`, so the callback must terminate there:

```
https://<api-origin>/api/display/callback
```

The TikTok Developer Portal redirect URI must be registered to that exact URL, and it
must share the origin configured in `OAUTH_CANONICAL_ORIGIN` — `loadDisplayConfig()`
rejects a mismatch at startup. The frontend never handles the authorization code.

Authorization start: `POST /api/display/connections/authorize` (session-authenticated).

---

## Database and migrations

Migrations live in `packages/db/drizzle` and are applied with Drizzle's migrator.

**Authoritative production migration command** — run against the deployed image:

```bash
docker run --rm \
  -e DATABASE_URL="postgresql://..." \
  <image> node packages/db/dist/src/migrate.js
```

Or, inside an already-running deployment:

```bash
node packages/db/dist/src/migrate.js          # from /repo
pnpm --filter @ttsdata/db migrate:production  # equivalent
```

The migrator is **compiled JavaScript** (`packages/db/dist/src/migrate.js`) and ships in
the runtime image. `pnpm --filter @ttsdata/db migrate` (the `tsx` variant) is a
**development-only** command: `tsx` is a devDependency, pruned from the runtime stage by
`--prod`, so it cannot run inside the production image. The Dockerfile asserts the
compiled migrator exists at build time, so an image that cannot migrate fails to build
rather than failing at deploy.

The migrations folder is resolved relative to the migrator module, so the command works
from any working directory. Override with `MIGRATIONS_FOLDER` if needed.

Migrations are **not** run automatically on container start: a rolling deploy would
race several instances against the same migration. Run them as an explicit deploy step
before rolling out the new image.

Forward-only in normal operation. `packages/db/drizzle/rollback/` contains reviewed
down-scripts; `pnpm verify:ccos-postgres` exercises forward → constraints → rollback →
reapply against a `_test` database.

**Rollback procedure**

1. Roll the service back to the previous image (safe: the service is stateless).
2. If the schema changed, apply the reviewed down-script from
   `packages/db/drizzle/rollback/` for the affected migration.
3. Re-run `pnpm verify:ccos-postgres` to confirm forward/rollback integrity.

Down-scripts refuse to run while live data would be destroyed — they raise rather than
silently drop populated tables.

---

## Health and readiness

| Endpoint | Purpose | Behaviour |
|---|---|---|
| `GET /health` | Readiness — includes a database round trip | `200 {"status":"ok","database":"connected"}` |
| `GET /health/deep` | Diagnostics | `200 {"status":"healthy","checks":{"database":"ok"}}` |

Point the platform health check at `/health`. It is unauthenticated and returns no
configuration.

---

## Logging

Structured JSON (pino) with redaction configured for `authorization` and `cookie`
request headers, `set-cookie` response headers, and `access_token` / `refresh_token` /
`code` / `client_secret` in request bodies. The startup summary logs a redacted
configuration object: the database password is replaced with `***`, secrets are logged
as lengths only.

Request bodies and headers are never logged wholesale.

---

## Selected platform

**Recommendation: a container platform that runs a Dockerfile from this repository with
managed PostgreSQL** — for example Railway, Render, or Fly.io. They are not equivalent,
so the choice is deliberately left to provisioning time; all three satisfy:

- runs the `apps/api` Dockerfile from this repo;
- managed PostgreSQL with a private connection string;
- server-side secret storage;
- HTTPS with a stable public hostname;
- health checks;
- log aggregation;
- independent scaling of the API, and a second process for future workers.

**Do not deploy the API to Netlify.** It is a Next.js host; `apps/api` is a long-lived
Fastify process with a database pool, which is a poor fit for serverless functions.
Netlify remains the frontend host.

`vercel.json` at the repository root references `@tiktok-client-key` and similar secret
names but the repository has no Vercel deployment path for `apps/api`. It is left
untouched by this node and should be reconciled separately.

---

## Container verification gate

`scripts/verify-api-container.sh` proves the image is deployable, and runs in CI
(`.github/workflows/api-container.yml`):

1. builds both stages from the repository root;
2. starts disposable PostgreSQL;
3. runs `node packages/db/dist/src/migrate.js` **inside the image** and asserts tables were created;
4. boots that exact image with production configuration;
5. asserts `/health` and `/health/deep` report a real database round trip;
6. asserts `/api/display/connections` returns **401** (registered and auth-protected; 404 would mean not deployed);
7. asserts SIGTERM exits **0** (graceful shutdown);
8. asserts no test secret is baked into the image and the runtime stage carries compiled JS only.

```bash
bash scripts/verify-api-container.sh
```

Uses disposable credentials only. No real provider or production database secret.

## Provisioning checklist (operator)

- [ ] Create the backend service from `apps/api/Dockerfile`
- [ ] Provision managed PostgreSQL; capture its connection string
- [ ] Set every required variable from the environment contract above
- [ ] Confirm the platform health check targets `/health`
- [ ] Run `node packages/db/dist/src/migrate.js` against the production database (see migrations above)
- [ ] Register the TikTok redirect URI as `https://<api-origin>/api/display/callback`
- [ ] Confirm the four Display scopes are granted
- [ ] Set the frontend's API base URL to `API_ORIGIN`
- [ ] Verify `GET /health` returns `database: connected`
