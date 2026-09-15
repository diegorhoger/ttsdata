# Project Roadmap

> Status: M0 in progress. Updated: 2026-09-15.

## Current Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 — Foundation | 🔄 In Progress | #35 blocked, #50/#51 implemented, #54 pending design |
| M1 — Authorized Data MVP | ⏳ Blocked | Depends on #35 capability matrix |
| M2 — Historical Data | ⏳ Blocked | Depends on M1 |
| M3 — Controlled Beta | ⏳ Blocked | Depends on M2 |
| M4 — Post-Beta | ⏳ Blocked | Aggregation/scraping decisions pending |

## Issue Tracker

### Open

| ID | Title | Status | Blocker |
|----|-------|--------|---------|
| #35 | TikTok Shop API Capability Matrix | 🔴 Blocked | Portal evidence (scopes, endpoints, API probes) |
| #39 | TikTok Shop Authorization | 🔴 Blocked | #35 |
| #40 | Authorized-Data Sync | 🔴 Blocked | #39 |
| #46 | My Performance Dashboard | 🔴 Blocked | #40 |
| #52 | Historical Snapshots | 🔴 Blocked | #40 |
| #54 | Connection Revocation & Deletion | 🟡 Pending Design | Independent — can proceed now |
| TTS-M2-01 | Personal Performance Score | 🔴 Blocked | #52, #53 |
| TTS-M2-02 | Watchlists | 🟡 Can Start | Entity types depend on #35 |
| TTS-M2-03 | Alert Rules | 🟡 Can Start | Triggers depend on #35 |
| TTS-M4-00 | Market Aggregation Auth Gate | 🔴 Blocked | #35 legal review |
| TTS-M4-01 | Market Opportunity Score | 🔴 Blocked | TTS-M4-00 |

### Complete

| ID | Title | Commit | Review |
|----|-------|--------|--------|
| #50 | Security Foundation | 48b2ee0 | 🔄 Independent review running |
| #51 | Data Quality Foundation | 48b2ee0 | 🔄 Independent review running |

## Repository

- URL: https://github.com/diegorhoger/ttsdata
- Branch: `master`
- Latest commit: `48b2ee0` — fix security/data-quality packages
- Tests: 72/72 passing
- Typecheck: 9/9 packages passing
- GitHub Issues: Not yet created (SSH key lacks API permissions)

## Immediate Next Steps

1. Await independent reviewer verdict for #50/#51
2. If REPAIR: fix and re-review
3. If APPROVE: #54 design + implementation can proceed independently
4. #35 requires user portal evidence: scope names, redacted screenshots, API test fixtures
5. TTS-M2-02/M2-03 can start once entity types confirmed by #35

## Architecture Decisions

- Official API first; scraping deferred pending legal review
- Private tenant zone required before any cross-tenant aggregation
- All metrics must carry provenance and classification
- Quality gates block ranking on stale/incomplete data
- No hardcoded secrets; env-based secret management
