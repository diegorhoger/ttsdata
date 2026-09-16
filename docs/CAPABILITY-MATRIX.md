# TikTok API Capability Matrix

## Verified Scope Inventory (from TikTok Partner Center portal)

**Date verified:** 2026-09-16
**Source:** User portal screenshot — App & Service → Manage API
**Status:** PORTAL_VERIFIED (needs legal review for Gate 2)

---

## Scope Categories

### Local Service
| Scope | Definition | Use Case |
|-------|-----------|----------|
| `local.product.manage` | Create and manage the product listing | Manage products for affiliate/shop |
| `local.shop.manage` | Create and manage the local shops | Shop profile management |
| `local.voucher.manage` | Validate and redeem the voucher | Voucher/coupon management |

### Portability (Data Export)
| Scope | Definition |
|-------|-----------|
| `portability.activity.ongoing` | Ongoing requests for activity data |
| `portability.activity.single` | Single request for activity data |
| `portability.all.ongoing` | Ongoing requests for all available data |
| `portability.all.single` | Single request for all available data |
| `portability.directmessages.ongoing` | Ongoing DM data requests |
| `portability.directmessages.single` | Single DM data request |
| `portability.postsandprofile.ongoing` | Ongoing posts+profile data requests |
| `portability.postsandprofile.single` | Single posts+profile data request |

### Research (Public Data Access)
| Scope | Definition |
|-------|-----------|
| `research.adlib.basic` | Access to public commercial data for research purposes |
| `research.data.basic` | Access to TikTok public data for research purposes |
| `research.data.u18eu` | Access to data from European users under 18 + all other public data |
| `research.data.vra` | Access to provisioned data for vetted researchers |

### User Info
| Scope | Definition | Target APIs |
|-------|-----------|-------------|
| `user.info.basic` | Read profile info (open id, avatar, display name) | Read profile info |
| `user.info.profile` | Read profile_web_link, profile_deep_link, bio_description, is_verified | Read additional profile info |
| `user.info.stats` | Read statistical data (likes count, follower count, following count, video count) | Read profile engagement statistics |

### Video
| Scope | Definition | Target APIs |
|-------|-----------|-------------|
| `video.list` | Read user's public videos | List Videos, Query Videos |
| `video.publish` | Directly post content to user's TikTok profile | Direct Post, Get Post Status |
| `video.upload` | Share content as a draft for creator to edit and post | Upload, Get Post Status, Share Video API |

---

## Key Findings

### Application Type
The verified scopes indicate a **creator-facing TikTok Open Platform application** (user.info + video.list + video.publish/upload) potentially combined with **Local Service** product/shop management capabilities.

### Implications for TTSData

1. **Creator profile access** — `user.info.basic`, `user.info.profile`, `user.info.stats` provide follow counts, video counts, likes — sufficient for creator discovery (#42)
2. **Video list access** — `video.list` enables creator video catalog browsing
3. **Research access** — `research.adlib.basic` provides **public commercial data for research purposes** — this may unlock market-wide product/creator intelligence WITHOUT requiring individual seller authorization
4. **Local service** — `local.product.manage` and `local.shop.manage` suggest product/shop management capabilities exist

### What's Still Unknown
- Whether `research.adlib.basic` provides market-wide product/shop/creator data (or only the requesting user's own data)
- Whether TikTok Shop-specific endpoints are accessible through these scopes
- Whether the application has been approved for Brazil marketplace
- Exact rate limits per endpoint
- Request signing requirements

### Next Verification Steps
1. Create a test application in TikTok portal
2. Obtain access token using verified scopes
3. Call `/user/info/basic/` with token
4. Call `/video/list/` with token
5. Call `/research/...` endpoints (if accessible)
6. Record exact response field names

---

*Document status: PORTAL_VERIFIED. Ready for legal review (Gate 2) once test API responses are captured.*
