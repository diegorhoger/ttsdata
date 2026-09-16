# TikTok API Verification Worksheet — v0.2

**Date:** 2026-09-16
**Status:** PORTAL_VERIFIED (scope names confirmed from user portal)
**Application type:** Web (creator-facing, seller later)
**Approved marketplace:** BR (to be verified)

---

## Purpose

This worksheet tracks the verification status of TikTok API capabilities for TTSData. No capability may enter implementation until it reaches at least `PORTAL_VERIFIED + PROBE_VERIFIED`. Storage and commercialization additionally require `LEGAL_REVIEWED`.

**CRITICAL:** Display API and TikTok Shop API are SEPARATE capability families. Scope names from one family do NOT validate endpoints from another.

---

## Status Definitions

| Status | Meaning |
|--------|---------|
| `UNVERIFIED` | No evidence; assumed from memory or convention |
| `DOC_VERIFIED` | Confirmed in official TikTok documentation |
| `PORTAL_VERIFIED` | Confirmed in TikTok Partner Center portal |
| `PROBE_VERIFIED` | Confirmed via controlled API response |
| `LEGAL_REVIEWED` | Data use reviewed by qualified Brazilian counsel |
| `EXCLUDED` | Intentionally excluded from MVP |

---

## Section 1: TikTok Display API (Connected User's Own Data)

### Authorization (CORRECTED from official TikTok Display API docs)

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Base URL | `https://open.tiktokapis.com/v2/` | Official docs | DOC_VERIFIED |
| Token exchange URL | `POST https://open.tiktokapis.com/v2/oauth/token/` | Official docs | DOC_VERIFIED |
| Access token header | `Authorization: Bearer <token>` | Official docs | DOC_VERIFIED |
| Request signing | None (Bearer token auth) | Official docs | DOC_VERIFIED |
| `open_id` parameter | NOT used — token authenticates user | Official docs | DOC_VERIFIED |

### User Info Endpoint

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Endpoint | `GET https://open.tiktokapis.com/v2/user/info/` | Official docs | DOC_VERIFIED |
| Parameters | `fields=open_id,display_name,avatar_url,follower_count,video_count` | Official docs | DOC_VERIFIED |
| Scope | `user.info.basic` (basic fields) | Official docs | DOC_VERIFIED |
| Scope | `user.info.profile` (extended profile) | Official docs | DOC_VERIFIED |
| Scope | `user.info.stats` (statistical data) | Official docs | DOC_VERIFIED |

### Video List Endpoint

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Endpoint | `POST https://open.tiktokapis.com/v2/video/list/` | Official docs | DOC_VERIFIED |
| Parameters | `fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count` | Official docs | DOC_VERIFIED |
| Body | `{"max_count": 20}` | Official docs | DOC_VERIFIED |
| Scope | `video.list` | Official docs | DOC_VERIFIED |

### What Display API Verifies

- Connected user's own TikTok profile (follower count, video count, avatar, display name)
- Connected user's public videos (view/like/share/comment counts, titles, creation dates)

### What Display API Does NOT Verify

- TikTok Shop products, prices, commissions
- GMV, orders, conversion rates
- Affiliate program analytics
- Market-wide product/creator discovery
- Any Shop-specific endpoint

---

## Section 2: TikTok Shop API (SEPARATE Capability Family)

### Authorization (from TikTok Shop API docs — SEPARATE from Display API)

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Base URL | `https://partner.tiktokshop.com/api/v2/` | Official docs | DOC_VERIFIED |
| Token exchange URL | `POST https://auth.tiktok-shops.com/api/v2/token/get` | Official docs | DOC_VERIFIED |
| Access token header | `x-tts-access-token` | Official docs | DOC_VERIFIED |
| Request signing | Required (algorithm TBD) | Official docs | DOC_VERIFIED |

### Verified Scopes (from user portal — PORTAL_VERIFIED)

| Scope | Category | Use Case |
|-------|----------|----------|
| `local.product.manage` | Local Service | Create and manage product listing |
| `local.shop.manage` | Local Service | Create and manage local shops |
| `local.voucher.manage` | Local Service | Validate and redeem vouchers |
| `portability.activity.ongoing` | Portability | Ongoing activity data export |
| `portability.activity.single` | Portability | Single activity data export |
| `portability.all.ongoing` | Portability | Full data archive export |
| `portability.all.single` | Portability | Single full data export |
| `portability.directmessages.ongoing` | Portability | DM data export |
| `portability.directmessages.single` | Portability | Single DM export |
| `portability.postsandprofile.ongoing` | Portability | Posts+profile export |
| `portability.postsandprofile.single` | Portability | Single posts+profile export |
| `research.adlib.basic` | Research | Public commercial data for research |
| `research.data.basic` | Research | TikTok public data for research |
| `research.data.u18eu` | Research | EU under-18 + public data |
| `research.data.vra` | Research | Provisioned data for vetted researchers |
| `user.info.basic` | User Info | Profile info (open id, avatar, display name) |
| `user.info.profile` | User Info | Extended profile (bio, links, verification) |
| `user.info.stats` | User Info | Statistical data (likes, followers, following, videos) |
| `video.list` | Video | Read user's public videos |
| `video.publish` | Video | Post content to TikTok |
| `video.upload` | Video | Upload draft content |

### TikTok Shop Endpoints (NOT YET VERIFIED — requires Shop API scope approval)

| Capability | Endpoint | Method | Exact scope | Subject | BR | Response fields | Limits | Retention | Evidence | Status |
|------------|----------|--------|-------------|---------|----|-----------------|--------|-----------|----------|--------|
| Shop product search | `/product/202309/products/search` | POST | `seller.product.basic` | Authorized shop | Verify | Verify | Verify | Verify | Official reference + probe | Partially verified |
| Creator authorization | UNKNOWN | UNKNOWN | Portal value | Creator | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Official guide + portal | Partially verified |
| Video analytics | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |
| Product detail | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |
| Category list | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |
| Order list | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |
| Affiliate analytics | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |
| Shop analytics | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |

---

## Section 3: Capability Family Separation (CRITICAL)

| Family | Endpoints | Use for TTSData | Status |
|--------|-----------|-----------------|--------|
| Display API | `open.tiktokapis.com/v2/user/info/`, `/video/list/` | Connected user's own profile + public videos | CAN PROBE |
| TikTok Shop Affiliate | `partner.tiktokshop.com/api/v2/...` | Authorized shop products/orders/commissions | NEEDS Shop scope |
| User exports | N/A (user uploads) | Seller/creator reports with consent | Viable |
| Local collector | User's own device | Permitted surfaces only | Contract review first |
| Research API | `developers.tiktok.com/products/research-api/` | Non-commercial research only | NOT for TTSData production |

**NEVER mix connected-user API data with browser observations. Rankings must be reproducible from eligible source records, and unavailable values must remain unavailable—not become zero.**

---

## Section 4: Safe Probe Practices

- Store token in `$TIKTOK_TOKEN` env var, never paste into chat
- Do NOT paste token, open_id, union_id, full profile URLs, or personal identifiers
- Commit only sanitized fixtures with stable placeholders (e.g., `open_id: "sample_open_id_123"`)
- Remove any PII before committing response fixtures

### Probe 1: User Info
```bash
curl -L \
  'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count' \
  -H 'Authorization: Bearer $TIKTOK_TOKEN'
```

### Probe 2: Video List
```bash
curl -L -X POST \
  'https://open.tiktokapis.com/v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count' \
  -H 'Authorization: Bearer $TIKTOK_TOKEN' \
  -H 'Content-Type: application/json' \
  --data '{"max_count":20}'
```

---

## Section 5: Next Steps

### Immediate (You)

1. **Generate a TikTok access token** (from TikTok portal → API Testing Tool)
2. **Run Display API probes** (store token in env var, do NOT paste)
3. **Paste sanitized JSON responses** here (remove PII, replace with placeholders)

### After Verification

4. **Legal review:**
   - Data retention terms
   - Aggregation permissions
   - Commercial use authorization
   - LGPD compliance

5. **Update this worksheet:**
   - Mark each capability with verified status
   - Add evidence references
   - Only then begin implementation

---

## References

- [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/)
- [List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/)
- [Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management/)
- [TikTok Shop Affiliate APIs](https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity)
- [Research Tools eligibility](https://developers.tiktok.com/products/research-api/)

---

*Document created: 2026-09-16*
*Status: PORTAL_VERIFIED — needs API probe (Gate 1) and legal review (Gate 2)*
*Next: User runs Display API probes and provides sanitized JSON responses*
