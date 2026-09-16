# TikTok Shop API Verification Worksheet — v0.2

**Date:** 2026-09-16
**Status:** PORTAL_VERIFIED (scope names confirmed from user portal)
**Application type:** Web (creator-facing + local service scopes visible)
**Approved marketplace:** BR (to be verified)

---

## What Changed from v0.1

The user provided actual scope names from TikTok Partner Center. Key discovery:
- Scopes are **TikTok Open Platform** style (user.info, video.list, etc.)
- NOT TikTok Shop API scopes (product.read, video.read, creator.read, etc.)
- `research.adlib.basic` may provide public commercial data access

---

## What's Confirmed (PORTAL_VERIFIED)

### Scope Names (verified from portal)
- `local.product.manage` — Create and manage product listing
- `local.shop.manage` — Create and manage local shops
- `local.voucher.manage` — Validate and redeem voucher
- `portability.activity.ongoing` / `.single` — Activity data export
- `portability.all.ongoing` / `.single` — Full data archive export
- `portability.directmessages.ongoing` / `.single` — DM data export
- `portability.postsandprofile.ongoing` / `.single` — Posts+profile export
- `research.adlib.basic` — Public commercial data for research
- `research.data.basic` — TikTok public data for research
- `research.data.u18eu` — EU under-18 + public data
- `research.data.vra` — Provisioned data for vetted researchers
- `user.info.basic` — Profile info (open id, avatar, display name)
- `user.info.profile` — Extended profile (bio, links, verification)
- `user.info.stats` — Statistical data (likes, followers, following, videos)
- `video.list` — Public videos list
- `video.publish` — Post content to TikTok
- `video.upload` — Upload draft content

### Application Type
Creator-facing web app with potential Local Service (product/shop) management.

### Authorization Flow
Standard OAuth 2.0 with scope-based authorization.
- Auth URL: `https://auth.tiktok-shops.com/oauth/authorize`
- Token URL: `https://auth.tiktok-shops.com/api/v2/token/get`
- Access token header: `x-tts-access-token`

---

## What's Still Unknown

### Gate 1 — Technical Verification (IN PROGRESS)
- [ ] Exact endpoint paths for each scope
- [ ] Rate limits per endpoint
- [ ] Pagination behavior
- [ ] Request signing mechanism
- [ ] Brazil marketplace support
- [ ] Whether `research.adlib.basic` provides market-wide data
- [ ] Whether Local Service scopes map to TikTok Shop endpoints

### Gate 2 — Legal Review
- [ ] Data retention terms
- [ ] Aggregation permissions
- [ ] Commercial use permissions
- [ ] LGPD lawful basis
- [ ] Data-subject rights

---

## Acceptance Criteria Status

- [ ] Every proposed metric maps to a verified endpoint and field — IN PROGRESS
- [ ] Granted scopes and marketplaces documented without secrets — PORTAL_VERIFIED
- [ ] Controlled API probes confirm documented behavior — PENDING
- [ ] Contractual and LGPD conclusions reviewed by qualified counsel — PENDING
- [ ] Unsupported product claims removed from backlog — PENDING

---

## References

- TikTok Partner Center: https://partner.tiktokshop.com/
- TikTok Shop API Developer Guide: https://partner.tiktokshop.com/docv2/page/tts-developer-guide

---

*Document created: 2026-09-16*
*Status: PORTAL_VERIFIED — needs API probe (Gate 1) and legal review (Gate 2)*
