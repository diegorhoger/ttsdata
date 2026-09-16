# Project Roadmap

> Status: M0/M1/M2 partially complete. Updated: 2026-09-15 22:30.

## Current Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M0 — Foundation | ✅ Complete | #50/#51 APPROVED + committed (fa4ad35, 0778573) |
| M1 — Authorized Data MVP | 🔄 Partially Complete | #41, #45, #46 implemented; #39/#40 blocked by #35 |
| M2 — Historical Data | 🔄 Partially Complete | TTS-M2-01, M2-02, M2-03, #42, #53 done; #52 blocked |
| M3 — Controlled Beta | ⏳ Blocked | Needs M1/M2 + 20-50 creators |
| M4 — Post-Beta | ⏳ Blocked | Referral (#44) done; others pending |

### Data Architecture (REVIEWER-APPROVED 2026-09-16)
- Display API (connected user's own profile + videos): ✅ can proceed after probe
- TikTok Shop Affiliate APIs: apply in Partner Center, verify scopes
- User exports/uploads: viable with consent + provenance
- Local collector (signed desktop extension): ⚠️ CONDITIONALLY APPROVED pending contractual review — does NOT authorize automated TikTok collection
- Research API: ❌ NOT for commercial TTSData
- Residential IP rotation / anti-detection: ❌ REJECTED
- Source families (Display/Shop/Export/Collector): NEVER mix

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

## Approved Hybrid Pipeline (2026-09-16)

Approved data architecture:
1. **Authorized TikTok APIs** (Display API + Shop Affiliate APIs when granted)
2. **User exports/uploads** (seller/creator reports with consent + provenance)
3. **Permitted local collector** (signed desktop/browser extension, NOT stealth)

Explicitly REJECTED:
- Residential IP rotation to evade rate limits/blocks ❌
- Stealth browsing / anti-detection ❌
- CAPTCHA solvers, identity rotation, block evasion ❌
- Research API for commercial TTSData use (non-commercial only) ❌
- Data-center browser claiming to be "real" ❌
- TikTok Shop Research API for commercial market intelligence ❌

### Source family separation (never mix)
- Display API: connected user's own profile + public videos
- TikTok Shop Affiliate APIs: authorized shop products/orders/commissions
- User exports: seller/creator reports with consent
- Permitted public observations: only expressly allowed surfaces

### Collector design requirements (when implemented)
- Signed desktop app / browser extension on user's device
- Shows when collecting is active
- Conservative rate limits + kill switch
- NEVER disguise automation or solve CAPTCHAs
- Records provenance: source URL, time, collector version, extraction method
- Encrypted evidence with strict retention + deletion lineage
- User can stop everything immediately

### Correct Next Steps (reviewer-approved)
1. Finish Display API docs + sanitized probes
2. Apply for TikTok Shop Affiliate API
3. Inventory exact granted Shop scopes/endpoints
4. Contract legal advice per collection surface
5. Define collector protocol + ingestion gateway (NO page automation)
6. Build authorized API ingestion first
7. Pilot transparent local collector for permitted surfaces only
8. Market rankings after coverage + deletion + cohort gates pass

## What's NOT Done (blocked by #35 verification)
- TikTok Shop OAuth flow (verified against capability matrix)
- Authorized-data synchronization pipeline (Display API can proceed, Shop API blocked)
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
