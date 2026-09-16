# TikTok API Verification Worksheet — v0.3

**Date:** 2026-09-16
**Status:** PORTAL_VERIFIED only for Display API scope names. All other families require separate grant verification.

---

## Critical Separation

| Family | Separate endpoint family | Use for TTSData |
|--------|--------------------------|-----------------|
| Display API | `open.tiktokapis.com/v2/` | Connected user's own profile + public videos |
| TikTok Shop API | `open-api.tiktokglobalshop.com/` | Shop products, orders, commissions |
| Data Portability | Per scope | User exports / uploads |
| Content Posting | Per scope | video.upload, video.publish |
| Local Service | Per scope | local.product.manage, local.shop.manage |
| Research API | Per scope | Non-commercial research ONLY |

---

## Section 1: TikTok Display API

### Authorization (CORRECTED — official TikTok Display API docs)

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Base URL | `https://open.tiktokapis.com/v2/` | Official docs | DOC_VERIFIED |
| Token exchange URL | `POST https://open.tiktokapis.com/v2/oauth/token/` | Official docs | DOC_VERIFIED |
| Access token header | `Authorization: Bearer <token>` | Official docs | DOC_VERIFIED |
| `open_id` parameter | NOT used — token authenticates user | Official docs | DOC_VERIFIED |

### Endpoints

| Item | Value | Source | Status |
|------|-------|--------|--------|
| User info | `GET /v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,video_count` | Official docs | DOC_VERIFIED |
| Video list | `POST /v2/video/list/?fields=id,title,create_time,cover_image_url,view_count,like_count,comment_count,share_count` | Official docs | DOC_VERIFIED |
| User info scope | `user.info.basic`, `user.info.profile`, `user.info.stats` | Portal + docs | SCOPE_AVAILABLE |

### What Display API Verifies
- Connected user's own profile (avatar, display name, follower count, video count)
- Connected user's public videos (view/like/share/comment counts, titles, creation dates)

### What Display API Does NOT Unlock (explicit)
- TikTok Shop products, prices, commissions
- GMV, orders, conversion rates
- Affiliate analytics or creator-market data
- Market-wide product/creator discovery

---

## Section 2: TikTok Shop API (SEPARATE)

### Authorization (CORRECTED — official TikTok Shop API docs)

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Base URL | `https://open-api.tiktokglobalshop.com/` | Official docs | DOC_VERIFIED |
| Token exchange | `GET /api/v2/token/get` | Official docs | DOC_VERIFIED |
| Access token header | `x-tts-access-token` | Official docs | DOC_VERIFIED |
| Authorization flow | OAuth 2.0 (confirmed) | Official docs | DOC_VERIFIED |
| Request signing | Required per TikTok Shop API spec | Official docs | UNVERIFIED |

### Verified scopes

| Scope | Granted? | Family | Status |
|-------|----------|--------|--------|
| `seller.product.basic` | UNVERIFIED | TikTok Shop | SCOPE_AVAILABLE |
| `product.read` | UNVERIFIED | TikTok Shop | SCOPE_AVAILABLE |
| `order.read` | UNVERIFIED | TikTok Shop | SCOPE_AVAILABLE |
| `local.product.manage` | UNVERIFIED | Local Service | SCOPE_AVAILABLE |
| `local.shop.manage` | UNVERIFIED | Local Service | SCOPE_AVAILABLE |
| `local.voucher.manage` | UNVERIFIED | Local Service | SCOPE_AVAILABLE |
| `video.upload` | UNVERIFIED | Content Posting | SCOPE_AVAILABLE |
| `video.publish` | UNVERIFIED | Content Posting | SCOPE_AVAILABLE |
| `portability.activity.ongoing` | UNVERIFIED | Data Portability (EEA/UK only, excl. US/BR) | SCOPE_AVAILABLE |
| `portability.activity.single` | UNVERIFIED | Data Portability (EEA/UK only) | SCOPE_AVAILABLE |
| `portability.all.ongoing` | UNVERIFIED | Data Portability (EEA/UK only) | SCOPE_AVAILABLE |
| `portability.all.single` | UNVERIFIED | Data Portability (EEA/UK only) | SCOPE_AVAILABLE |
| `portability.directmessages.*` | UNVERIFIED | Data Portability | SCOPE_AVAILABLE |
| `portability.postsandprofile.*` | UNVERIFIED | Data Portability | SCOPE_AVAILABLE |
| `research.adlib.basic` | UNVERIFIED | Research | SCOPE_AVAILABLE — NOT for commercial TTSData |
| `research.data.basic` | UNVERIFIED | Research | SCOPE_AVAILABLE — NOT for commercial TTSData |

**Total: 21 scopes listed**

---

## Section 3: Data Portability (EEA/UK exclusive — NOT applicable to BR)

| Scope | Granted? | Limitation | Status |
|-------|----------|------------|--------|
| `portability.activity.ongoing` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.activity.single` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.all.ongoing` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.all.single` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.directmessages.ongoing` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.directmessages.single` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.postsandprofile.ongoing` | UNVERIFIED | EEA/UK users only | REJECTED for BR |
| `portability.postsandprofile.single` | UNVERIFIED | EEA/UK users only | REJECTED for BR |

---

## Section 4: Capability Family Separation

| Family | Use for TTSData | Separate gates |
|--------|-----------------|----------------|
| Display API | Connected user profile + videos | Probe → private analytics |
| TikTok Shop APIs | Products, GMV, orders, commissions | Scope approval → probes |
| Data Portability | EEA/UK export (NOT Brazil) | EEA/UK only → rejected |
| User-exports | User uploads with consent | Consent + provenance |
| Local collector | Permitted surfaces only | Contract review first |
| Research API | Non-commercial research only | NOT for TTSData |

---

## Section 5: Safe Probe Practices

- Store token in `$TIKTOK_TOKEN` env var, never paste into chat
- Replace `open_id`, `union_id`, usernames, avatar URLs, tokens, log_ids with placeholders
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

---

## Section 6: Next Steps

### Immediate (You)
1. Generate a TikTok Display API access token
2. Run the two probes above
3. Paste sanitized JSON responses here (replace PII with placeholders)

### After Display API Verification
4. Legal review: data retention, aggregation permissions, LGPD
5. Build OAuth (#39) for Display API only
6. Build ingestion (#40) for connected user's own data

### Separately (Shop API — NOT unblocked by Display probes)
7. Apply for TikTok Shop Affiliate API product
8. Inventory exact granted Shop scopes
9. Verify Shop endpoints with probes
10. Legal review of Shop API data-use terms

---

## References

- [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/)
- [List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/)
- [Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management/)
- [TikTok Shop Affiliate APIs](https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity)
- [Research Tools eligibility](https://developers.tiktok.com/products/research-api/)

---

*Document created: 2026-09-16*
*Status: PORTAL_VERIFIED for Display API scope names only. All other families require separate grant + probe + legal review.*
*Next: User runs Display API probes and provides sanitized JSON responses.*
