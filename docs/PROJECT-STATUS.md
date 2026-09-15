# Project Roadmap

> Status: M0 in progress. Updated: 2026-09-15 19:30.

## Current Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 — Foundation | 🔄 In Progress | #35 blocked on portal evidence; #50/#51 approved; #54 repaired and under re-review |
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
| TTS-M2-01 | Personal Performance Score | 🔴 Blocked | #52, #53 |
| TTS-M2-02 | Watchlists | ✅ API built, frontend done | Under review |
| TTS-M2-03 | Alert Rules | 🟡 Can Start | Triggers depend on #35 |
| TTS-M4-00 | Market Aggregation Auth Gate | 🔴 Blocked | #35 legal review |
| TTS-M4-01 | Market Opportunity Score | 🔴 Blocked | TTS-M4-00 |

### Complete

| ID | Title | Commit | Review |
|----|-------|--------|--------|
| #50 | Security Foundation | 48b2ee0 | ✅ APPROVED by independent reviewer |
| #51 | Data Quality Foundation | 48b2ee0 | ✅ APPROVED by independent reviewer |
| #54 | Connection Deletion Lifecycle | 8e1ea22 → 83ca60f (repairs) | 🔄 Re-review in progress |

## Repository

- URL: https://github.com/diegorhoger/ttsdata.git
- Branch: `master`
- Latest commit: `71b5375` — feat: add watchlists frontend page
- Tests: 84/84 passing
- Typecheck: 9/9 packages passing
- GitHub Issues: Not yet created (SSH key lacks API permissions)
- Issue files prepared: `github-issues/035.md`, `050.md`, `051.md`, `054.md`

## Commits (latest 6)

```
71b5375 feat: add watchlists frontend page
83ca60f fix: address reviewer findings for Issue #54 deletion lifecycle
8e1ea22 feat: add connection deletion lifecycle (Issue #54)
48b2ee0 fix: add @types/node, resolve export ambiguity
0778573 test: fix timing issues in quality tests - all 72 tests passing
fa4ad35 feat: add security and data-quality packages for M0 foundation
```

## Immediate Next Steps

1. Await reviewer verdict for #54 repairs (commit 83ca60f)
2. If REPAIR: fix and re-review
3. If APPROVE: watchlists (TTS-M2-02) review can proceed
4. #35 requires user portal evidence: scope names, redacted screenshots, API test fixtures
5. TTS-M2-03 (Alerts) can start once entity types confirmed by #35

## Architecture Decisions

- Official API first; scraping deferred pending legal review
- Private tenant zone required before any cross-tenant aggregation
- All metrics must carry provenance and classification
- Quality gates block ranking on stale/incomplete data
- No hardcoded secrets; env-based secret management
- Cross-tenant access fails closed (verified by tests)
- Deletion is idempotent (safe to retry)
