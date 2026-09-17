# TikTok API Verification Worksheet

**Date:** 2026-09-16
**Status:** DOC_VERIFIED for Display API endpoint paths only. NO capability is PROBE_VERIFIED. NO scope is confirmed as granted.
**Application type:** Web (creator-facing, seller later)
**Approved marketplace:** BR (to be verified)

---

## Purpose

This worksheet tracks verification status for TikTok API capabilities TTSData needs. No capability may enter implementation until it reaches `PROBE_VERIFIED`. Storage and commercialization additionally require `LEGAL_REVIEWED`.

**CRITICAL SEPARATION:** TikTok Display API, TikTok Shop API, Data Portability, Content Posting, Local Service, and Research API are SEPARATE capability families. Scope names from one family do NOT validate endpoints from another.

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| `UNVERIFIED` | No evidence; assumed from memory or convention |
| `DOC_VERIFIED` | Confirmed in official TikTok documentation (endpoint path exists) |
| `SCOPE_AVAILABLE` | Scope name observed in portal list but NOT confirmed as granted to this app |
| `PROBE_VERIFIED` | Confirmed via controlled API response with live token |
| `LEGAL_REVIEWED` | Data use reviewed by qualified Brazilian counsel |
| `EXCLUDED` | Intentionally excluded from MVP |

---

## Section 1: TikTok Display API (Connected User's Own Data)

### Authorization

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Base URL | `https://open.tiktokapis.com/v2/` | Official docs | DOC_VERIFIED |
| Token exchange URL | `POST https://open.tiktokapis.com/v2/oauth/token/` | Official docs | DOC_VERIFIED |
| Access token header | `Authorization: Bearer <token>` | Official docs | DOC_VERIFIED |
| Request signing | None (Bearer token auth) | Official docs | DOC_VERIFIED |
| `open_id` parameter | NOT used — token authenticates user | Official docs | DOC_VERIFIED |
| Authorization flow | OAuth 2.0 (exact flow NOT separately confirmed; only token endpoint verified) | Official docs | PARTIALLY_VERIFIED |

### Endpoints

| Item | Value | Source | Status |
|------|-------|--------|--------|
| User info | `GET /v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count` | Official docs | DOC_VERIFIED |
| Video list | `POST /v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count` | Official docs | DOC_VERIFIED |

### Scopes (AVAILABLE in portal — granted status NOT confirmed)

| Scope | Family | Granted? | Status |
|-------|--------|----------|--------|
| `user.info.basic` | Display API | UNVERIFIED | SCOPE_AVAILABLE |
| `user.info.profile` | Display API | UNVERIFIED | SCOPE_AVAILABLE |
| `user.info.stats` | Display API | UNVERIFIED | SCOPE_AVAILABLE |
| `video.list` | Display API | UNVERIFIED | SCOPE_AVAILABLE |

### What Display API Verifies
- Connected user's own profile (follower count, video count, avatar, display name)
- Connected user's public videos (view/like/share/comment counts, titles, creation dates)

### What Display API Does NOT Verify
- TikTok Shop products, prices, commissions
- GMV, orders, conversion rates
- Affiliate analytics or creator-market data
- Market-wide product/creator discovery
- Any Shop-specific endpoint

### Display API ≠ Production Readiness (legal gates still required)
Even after probe verification, Display API data requires:
- [ ] Data retention period documented
- [ ] LGPD lawful basis confirmed (consent or legitimate interest, per use case)
- [ ] Data-use scope documented
- [ ] User right to deletion implemented
- [ ] Data export format defined (LGPD right to portability)
- [ ] Consent text + policy version embedded at collection time
- [ ] No cross-source joins without explicit authorization

---

## Section 2: TikTok Shop API (SEPARATE FAMILY)

### Authorization

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Base URL | `https://open-api.tiktokglobalshop.com/` | Official docs | DOC_VERIFIED |
| Token exchange | `GET /api/v2/token/get` | Official docs | DOC_VERIFIED |
| Access token header | `x-tts-access-token` | Official docs | DOC_VERIFIED |
| Authorization flow | OAuth 2.0 | Official docs | DOC_VERIFIED |
| Request signing | Required per TikTok Shop API spec | Official docs | UNVERIFIED (algorithm unknown) |

### Scopes (AVAILABLE in portal — granted status NOT confirmed)

| Scope | Family | Granted? | Status |
|-------|--------|----------|--------|
| `seller.product.basic` | TikTok Shop | UNVERIFIED | SCOPE_AVAILABLE |
| `local.product.manage` | Local Service | UNVERIFIED | SCOPE_AVAILABLE |
| `local.shop.manage` | Local Service | UNVERIFIED | SCOPE_AVAILABLE |
| `local.voucher.manage` | Local Service | UNVERIFIED | SCOPE_AVAILABLE |

### TikTok Shop Endpoints (NOT verified — require scope approval + probe)

| Capability | Endpoint | Method | Scope | Status |
|------------|----------|--------|-------|--------|
| Product search | UNKNOWN | UNKNOWN | `seller.product.basic` | UNVERIFIED |
| Product detail | UNKNOWN | UNKNOWN | `seller.product.basic` | UNVERIFIED |
| Order list | UNKNOWN | UNKNOWN | UNVERIFIED | UNVERIFIED |
| Affiliate analytics | UNKNOWN | UNKNOWN | UNVERIFIED | UNVERIFIED |
| Shop analytics | UNKNOWN | UNKNOWN | UNVERIFIED | UNVERIFIED |

**NOTE:** `product.read` and `order.read` are NOT confirmed scope names. Only `seller.product.basic` was observed in the portal. Actual Shop scope names must be verified from the granted application.

---

## Section 3: Data Portability (SEPARATE — EEA/UK ONLY)

| Scope | Family | Use for TTSData? |
|-------|--------|------------------|
| `portability.activity.ongoing` | Data Portability | ❌ EEA/UK only |
| `portability.activity.single` | Data Portability | ❌ EEA/UK only |
| `portability.all.ongoing` | Data Portability | ❌ EEA/UK only |
| `portability.all.single` | Data Portability | ❌ EEA/UK only |
| `portability.directmessages.ongoing` | Data Portability | ❌ EEA/UK only |
| `portability.directmessages.single` | Data Portability | ❌ EEA/UK only |
| `portability.postsandprofile.ongoing` | Data Portability | ❌ EEA/UK only |
| `portability.postsandprofile.single` | Data Portability | ❌ EEA/UK only |

All Data Portability scopes are limited to EEA/UK users. NOT applicable to Brazil (BR) marketplace.

---

## Section 4: Content Posting (SEPARATE — WRITE SCOPES)

| Scope | Family | Use for TTSData? |
|-------|--------|------------------|
| `video.upload` | Content Posting | ❌ Write scope, not for ingestion |
| `video.publish` | Content Posting | ❌ Write scope, not for ingestion |

These scopes are author-side posting capabilities. They have NO role in an ingestion pipeline.

---

## Section 5: Research API (SEPARATE — NON-COMMERCIAL ONLY)

| Scope | Family | Use for TTSData? |
|-------|--------|------------------|
| `research.adlib.basic` | Research | ❌ NON-COMMERCIAL ONLY |
| `research.data.basic` | Research | ❌ NON-COMMERCIAL ONLY |
| `research.data.u18eu` | Research | ❌ NON-COMMERCIAL ONLY |
| `research.data.vra` | Research | ❌ NON-COMMERCIAL ONLY |

Research API is for qualified non-commercial research only. NOT suitable for TTSData's commercial market intelligence product.

---

## Section 6: Capability Family Separation

| Family | Endpoints | Use for TTSData | Status |
|--------|-----------|-----------------|--------|
| Display API | `open.tiktokapis.com/v2/user/info/`, `/video/list/` | Connected user profile + videos | DOC_VERIFIED (paths only) |
| TikTok Shop API | `open-api.tiktokglobalshop.com/` | Products, GMV, orders, commissions | UNVERIFIED |
| Data Portability | Per scope | EEA/UK export only | REJECTED for BR |
| User exports | N/A (user uploads) | Seller/creator reports with consent | VIABLE with consent |
| Local collector | User's own device | Permitted surfaces only | CONDITIONAL (contract review) |
| Research API | Per scope | Non-commercial research only | REJECTED for commercial |

**NEVER mix connected-user API data with browser observations. Rankings must be reproducible from eligible source records, and unavailable values must remain unavailable—not become zero.**

---

## Section 7: Safe Probe Practices

- Store token in `$TIKTOK_TOKEN` env var, never paste into chat
- Replace `open_id`, `union_id`, usernames, avatar URLs, tokens, log_ids with placeholders
- Preserve field names, value types, nulls, pagination structure, error objects
- Commit only sanitized fixtures with stable placeholders
- Remove any PII before committing

### Probe 1: User Info

```bash
curl -L 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count' \
  -H 'Authorization: Bearer $TIKTOK_TOKEN'
```

### Probe 2: Video List

```bash
curl -L -X POST 'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count' \
  -H 'Authorization: Bearer $TIKTOK_TOKEN' \
  -H 'Content-Type: application/json' \
  --data '{"max_count":20}'
```

**These probes verify ONLY the connected user's own profile and public videos (Display API). They do NOT clear Shop storage/commercialization gates.**

---

## Section 8: Next Steps

### Immediate (You)

1. Generate a TikTok Display API access token from portal → API Testing Tool
2. Run the two probes above
3. Paste sanitized JSON responses here (replace PII with placeholders)

### After Display API Probe Verification

4. Legal review: data retention, LGPD, aggregation permissions
5. Build Display API OAuth flow (creator profile read, video list read)
6. Build Display API ingestion for connected user's own data only
7. Private analytics dashboards for connected user only

### Separately (TikTok Shop — NOT unblocked by Display probes)

8. Apply for TikTok Shop Affiliate API product in Partner Center
9. Inventory exact granted Shop scopes + endpoints (probe each)
10. Verify Shop endpoints with live API probes
11. Legal review of Shop API data-use terms
12. Build Shop ingestion (depends on Shop scope approval + probe verification)

---

## References

- [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/)
- [List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/)
- [Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management/)
- [TikTok Shop Affiliate APIs](https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity)
- [Research Tools eligibility](https://developers.tiktok.com/products/research-api/)

---

*Document status: Draft for independent review.*
*NO scope confirmed as granted. NO endpoint probed. NO production credentials used or requested.*
*Next: User runs Display API probes and provides sanitized JSON responses.*
