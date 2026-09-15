# TTSData — TikTok Shop Market Intelligence

> Find the right TikTok Shop product, understand why it is moving, and know what content to create before the opportunity becomes saturated.

TTSData is a data intelligence platform for TikTok Shop affiliates, creators, sellers, brands, and agencies. It combines official TikTok Shop API data, historical snapshots, transparent derived metrics, and AI-assisted creative analysis.

**Market:** Brazil first, international expansion later

## Architecture

```
ttsdata/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router)
│   ├── api/          # Fastify API server
│   └── worker/       # BullMQ ingestion workers
├── packages/
│   ├── shared/       # Domain types, provenance, plans
│   ├── db/           # Drizzle ORM schema + migrations
│   └── ui/           # Shared UI components
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

## Tech Stack

- **Frontend:** Next.js 14 + Tailwind CSS + shared UI package
- **Backend:** Node.js + Fastify + TypeScript
- **Database:** PostgreSQL 16 (Drizzle ORM)
- **Queue:** Redis + BullMQ
- **Auth:** Session-based (cookie + bcrypt)
- **API client:** Rate-aware TikTok Shop API client
- **AI:** OpenAI Whisper (transcription) + GPT-4 (creative analysis)
- **Billing:** Stripe (BRL support)

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16
- Redis 7
- Docker Compose (for local databases)

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Start databases
docker-compose up -d

# 3. Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Run migrations
pnpm db:migrate

# 5. Start development servers
pnpm dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:generate` | Generate migration files |
| `pnpm worker` | Start the worker process |

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in
- `POST /api/auth/logout` — Sign out
- `GET /api/auth/me` — Get current user

### Products
- `GET /api/products` — Search and filter products
- `GET /api/products/:id` — Product detail with scores, history, creators, videos

### TikTok Shop
- `GET /api/tiktok/auth-url` — Get OAuth URL
- `GET /api/tiktok/callback` — OAuth callback
- `GET /api/tiktok/connections` — List connections
- `DELETE /api/tiktok/connections/:id` — Disconnect

### Health
- `GET /health` — Basic health check
- `GET /health/deep` — Deep health check with database

## Scoring Model

**Opportunity Score** (0-100):
- 30% Momentum
- 20% Commercial traction
- 15% Commission attractiveness
- 15% Low saturation
- 10% Content velocity
- 10% Product quality/stability

**Saturation Score** (low/moderate/high/unknown):
- Creator count
- Video velocity
- Engagement concentration
- Trend age
- Content-to-commercial growth ratio

## License

Proprietary. All rights reserved.
