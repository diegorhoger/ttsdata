**Labels:** `api`, `product`, `legal`, `P0`
**Milestone:** `M0 — Foundation`

---

## User story

As the product team, we need a verified capability matrix so that product promises never exceed the scopes, endpoints, fields, rate limits, or retention rules granted to TTSData.

## Requirements

### Gate 1 — Technical Verification

- Inventory all approved applications, scopes, environments, and marketplaces
- Map each planned field to its official endpoint and authorization requirement
- Record pagination, rate limit, webhook, freshness, and retention constraints
- Distinguish partner-wide discovery data from seller-authorized first-party data
- Identify unavailable MVP fields and define their UI behavior
- Store links to the governing API documentation and policy version

### Gate 2 — Legal Review

- Review data retention, aggregation, commercialization, and user-rights conclusions
- Reconcile with applicable TikTok agreement
- Define permitted data uses and restrictions

### Deliverable

Single document containing:

| Field | Description |
|-------|-------------|
| Application type | Affiliate, creator, seller, or partner |
| Approved marketplace | BR, US, etc. |
| Granted scopes | Exact scope names from portal |
| Endpoint inventory | Every endpoint called |
| Field mapping | Each metric → exact endpoint + field |
| Rate limits | Per-endpoint quotas |
| Pagination | Cursor, page size, max pages |
| Authorization lifecycle | Token expiry, refresh, revocation |
| Retention constraints | How long data may be stored |
| Aggregation permissions | Can data be combined across accounts? |
| Commercialization | Can benchmarks be exposed publicly? |
| Unavailable fields | What the API does NOT provide |
| Account-type differences | Affiliate vs. creator vs. seller |

## Acceptance criteria

- [ ] Every proposed metric maps to a verified endpoint and field
- [ ] Granted scopes and marketplaces documented without secrets
- [ ] Controlled API probes confirm documented behavior
- [ ] Contractual and LGPD conclusions reviewed by qualified counsel
- [ ] Unsupported product claims removed from backlog

## Non-secret inputs required

- Application type (affiliate/creator/seller/partner)
- Granted scope names from TikTok Partner Center → Manage API
- Redacted portal screenshots
- API Testing Tool response fixtures (sanitized)

## References

- [Official TikTok Shop API](https://partner.tiktokshop.com/)
- [TikTok Shop Scopes](https://partner.tiktokshop.com/)
