# TikTok Shop API Verification Worksheet — v0.1

**Date:** 2026-09-14
**Status:** UNVERIFIED — Technical verification failed; implementation gate remains closed
**Application type:** Web (iOS/Android later)
**Approved marketplace:** BR (Brazil) first, others later

---

## Purpose

This worksheet tracks the verification status of every TikTok Shop API capability TTSData needs. No capability may enter implementation until it reaches at least `PORTAL_VERIFIED + PROBE_VERIFIED`. Storage and commercialization additionally require `LEGAL_REVIEWED`.

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

## Capability Verification Table

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
| Creator analytics | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | None | Unverified |

---

## Known Correct Information

### Authorization

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Token exchange URL | `GET https://auth.tiktok-shops.com/api/v2/token/get` | Official docs | DOC_VERIFIED |
| Access token header | `x-tts-access-token` | Official docs | DOC_VERIFIED |
| Request signing | Required (algorithm unknown) | Official docs | DOC_VERIFIED |
| Authorization flow | UNKNOWN (not confirmed as OAuth 2.0 + PKCE) | — | UNVERIFIED |

### Product Search

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Endpoint | `POST /product/202309/products/search` | Official docs | DOC_VERIFIED |
| Required scope | `seller.product.basic` | Official docs | DOC_VERIFIED |
| Subject | Authorized shop (not market-wide) | Official docs | DOC_VERIFIED |
| BR support | UNKNOWN | — | UNVERIFIED |

### Creator Authorization

| Item | Value | Source | Status |
|------|-------|--------|--------|
| Separate flow | Yes (creator grants app access) | Official guide | DOC_VERIFIED |
| Required for | Creator APIs | Official guide | DOC_VERIFIED |
| Exact endpoint | UNKNOWN | — | UNVERIFIED |
| Exact scope | UNKNOWN (check portal) | — | UNVERIFIED |

---

## Unknown Values (Must Be Verified)

### Token Lifecycle

| Item | Value | Action |
|------|-------|--------|
| Access token expiry | UNKNOWN | Read from official response/portal |
| Refresh token expiry | UNKNOWN | Verify rotation and reuse behavior |
| Token refresh mechanism | UNKNOWN | Read from official docs |
| Revocation endpoint | UNKNOWN | Read from official docs |

### Rate Limits

| Item | Value | Action |
|------|-------|--------|
| Per-endpoint limits | UNKNOWN | Record per endpoint and authorization context |
| Burst limits | UNKNOWN | Verify against portal |
| Throttling behavior | UNKNOWN | Verify against portal |

### Request Signing

| Item | Value | Action |
|------|-------|--------|
| Signature algorithm | UNKNOWN | Read from official docs |
| Canonicalization rules | UNKNOWN | Read from official docs |
| Required common parameters | UNKNOWN | Read from official docs |
| Timestamp tolerance | UNKNOWN | Read from official docs |
| Shop cipher / context | UNKNOWN | Read from official docs |
| Replay / clock-skew behavior | UNKNOWN | Read from official docs |

---

## Field Verification Template

Every field must be verified with:

| Required evidence | Example |
|-------------------|---------|
| Endpoint | Exact versioned route |
| JSON path | `data.products[].skus[]...` |
| Scope | Exact portal scope |
| Authorization subject | Shop, creator or partner |
| Marketplace | BR |
| Unit/type | Minor currency unit, decimal, integer |
| Nullability | Required, optional or conditional |
| Observation semantics | Lifetime, selected range or current value |
| Evidence | Official page and sanitized probe fixture |

---

## Account-Type Verification

| Data | Affiliate | Creator | Seller | Status |
|------|-----------|---------|--------|--------|
| Own product catalog | UNKNOWN | UNKNOWN | UNKNOWN | UNVERIFIED |
| Own video performance | UNKNOWN | UNKNOWN | UNKNOWN | UNVERIFIED |
| Own GMV/commission | UNKNOWN | UNKNOWN | UNKNOWN | UNVERIFIED |
| Own follower data | UNKNOWN | UNKNOWN | UNKNOWN | UNVERIFIED |
| Market-wide rankings | EXCLUDED | EXCLUDED | EXCLUDED | EXCLUDED |
| Cross-account comparison | EXCLUDED | EXCLUDED | EXCLUDED | EXCLUDED |

---

## Excluded from MVP (Not Evidenced)

| Capability | Reason | Status |
|------------|--------|--------|
| Market-wide product ranking | Not evidenced by currently verified scopes | EXCLUDED |
| Creator comparison | Not evidenced by currently verified scopes | EXCLUDED |
| Shop comparison | Not evidenced by currently verified scopes | EXCLUDED |
| Sales attribution per video | Not evidenced by currently verified scopes | EXCLUDED |
| Buyer demographics | Not evidenced by currently verified scopes | EXCLUDED |
| Competitor pricing | Not evidenced by currently verified scopes | EXCLUDED |

---

## Next Steps

### Immediate (You)

1. **Export from TikTok Partner Center:**
   - Go to Partner Center → App & Service → Manage → Manage API
   - Record exact scope names granted to your application
   - Record application type and authorized marketplaces
   - Screenshot (redact secrets)

2. **Use official API Testing Tool:**
   - Make controlled API calls for each endpoint
   - Save sanitized response fixtures (remove PII, tokens)
   - Record exact field names, types, and nullability

3. **Verify authorization flow:**
   - Confirm exact token endpoint
   - Confirm request signing requirements
   - Confirm token expiry and refresh behavior

### After Verification

4. **Legal review:**
   - Data retention terms
   - Aggregation permissions
   - Commercial use permissions
   - LGPD compliance

5. **Update this worksheet:**
   - Mark each capability with verified status
   - Add evidence references
   - Only then begin implementation

---

## References

- [Official TikTok Shop API documentation](https://partner.tiktokshop.com/docv2/page/1349387663220758)
- [Search Products endpoint](https://partner.tiktokshop.com/docv2/page/search-products-202309)
- [Connecting Shops](https://partner.tiktokshop.com/docv2/page/connecting-shops)
- [Sign Your API Request](https://partner.tiktokshop.com/docv2/page/sign-your-api-request)
- [Access Scope](https://partner.tiktokshop.com/docv2/page/access-scope)
- [Creator Authorization Guide](https://partner.tiktokshop.com/docv2/page/creator-authorization-guide)
- [Affiliate Integration](https://partner.tiktokshop.com/docv2/page/affiliate-integration)

---

*Document created: 2026-09-14*
*Status: UNVERIFIED — Technical verification failed; implementation gate remains closed*
*Next: Verify against TikTok portal and official API Testing Tool*
