# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Security foundation** (`@ttsdata/security`, Issue #50)
  - Tenant isolation with fail-closed cross-tenant access (`assertTenantAccess`, `createTenantScopedRepository`)
  - Role-based authorization (`owner`, `admin`, `analyst`, `viewer`) with 8 permissions
  - Audit logging with automatic secret redaction (`sanitizeForAudit`)
  - Secret management via environment (`getSecret`, `redactSecret`)
  - Input validation helpers (UUID, email, string, number)
- **Data quality foundation** (`@ttsdata/data-quality`, Issue #51)
  - Provenance contracts: `DataProvenance`, `WithProvenance`, creators for observed/calculated/inferred/unavailable
  - Metric classification: 5 types with labels and descriptions
  - Quality dimensions: freshness, completeness, accuracy with configurable thresholds
  - `isQualitySufficientForRanking()` gate — blocks ranking when quality fails
  - Generic quarantine with exponential-backoff replay (no source-specific payload shape assumed)
- Test suite: **72 tests passing** (40 security + 32 data-quality)

### Changed

- Fixed timing issues in quality tests (explicit config injection)
- Added `@types/node` to security and data-quality packages
- Resolved `MetricClassification` export ambiguity in data-quality index

### Fixed

- Tenant isolation now enforced at repository wrapper layer
- Quarantine replay mutates record in place (immutable update pattern was incorrect)

## [0.1.0] - 2026-09-14

### Added

- Monorepo scaffold (Turborepo, pnpm workspaces)
- Next.js 14 frontend with product discovery and detail pages
- Fastify API with auth, products, TikTok OAuth routes, health checks
- Drizzle ORM schema (17 tables) with migrations
- BullMQ worker with scheduled ingestion/snapshot/trend/scoring jobs
- Explainable Opportunity Score and Saturation Score engines
- Docker Compose for local PostgreSQL + Redis
