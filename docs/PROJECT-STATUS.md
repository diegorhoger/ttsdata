# Project Roadmap

> Status: M0/M1/M2 partially complete. Updated: 2026-09-15 22:30.

## Current Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 — Foundation | ✅ Complete | #50, #51, #54 all APPROVED by independent reviewers |
| M1 — Authorized Data MVP | 🔄 Partially Complete | #41, #46 implemented; #39/#40 blocked by #35 |
| M2 — Historical Data | 🔄 Partially Complete | TTS-M2-01, M2-02, M2-03, #42, #53 completed; #52 blocked |
| M3 — Controlled Beta | ⏳ Blocked | Needs M1/M2 completion + beta user recruitment |
| M4 — Post-Beta | ⏳ Blocked | Referral system (#44) implemented; others incomplete |

## Issue Tracker

### Closed (10)
- #50 Security Foundation — APPROVED
- #51 Data Quality Foundation — APPROVED
- #54 Connection Deletion Lifecycle — APPROVED (after critical cross-tenant vuln fix)
- TTS-M2-01 Personal Performance Score — implemented
- TTS-M2-02 Watchlists — APPROVED
- TTS-M2-03 Alert Rules — APPROVED (after critical cross-tenant vuln fix)
- #42 Creator Ranking & Discovery — APPROVED
- #44 Referral System — implemented
- #45 Onboarding Optimization — implemented
- #46 My Performance Dashboard — implemented
- #53 Data Quality Monitoring — implemented

### Open (6) — All blocked on #35
- #35 TikTok Shop API Capability Matrix — BLOCKED (portal evidence)
- #39 TikTok Shop OAuth Flow — BLOCKED (needs #35)
- #40 Authorized-Data Sync — BLOCKED (needs #39)
- #52 Historical Snapshots — BLOCKED (needs #40)
- #43 Video Creative Analysis — BLOCKED (needs data ingestion)
- #55 Controlled Beta Validation — BLOCKED (needs beta users)

## Repository
- URL: https://github.com/diegorhoger/ttsdata
- Branch: `master`
- Latest commit: `3f6c59a` — feat: add referral system API (Issue #44)
- Tests: 107/107 passing (16 test files)
- Typecheck: 9/9 packages passing
- Issues: 15 open, 10+ closed (tracked on GitHub)
- Labels: product, frontend, backend, data, api, ai, security, billing, accessibility, observability, P0, P1, P2, blocked

## What's NOT Done (blocked by #35)
- TikTok Shop OAuth flow (verified against capability matrix)
- Authorized-data synchronization pipeline
- Historical snapshots with provenance
- Video creative analysis (needs Whisper AI + ingestion)
- Controlled beta validation (needs 20-50 creator users)

## Architecture Decisions
- Official API first; scraping deferred pending legal review
- Private tenant zone required before any cross-tenant aggregation
- All metrics carry provenance and classification
- Quality gates block ranking when data is stale/incomplete
- Cross-tenant access fails closed (verified by tests)
- Deletion is idempotent (safe to retry)

## Next Steps for User
1. Provide TikTok portal evidence (scope names, redacted screenshots) to unblock #35
2. Connect a real TikTok Shop account for end-to-end testing
3. Legal review of capability matrix against TikTok's agreement
