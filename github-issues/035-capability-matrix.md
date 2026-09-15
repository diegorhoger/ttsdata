## Labels
`api`, `product`, `legal`, `P0`

## Milestone
`M0 — Foundation`

---

### User story

As the product team, we need a verified capability matrix so that product promises never exceed the scopes, endpoints, fields, rate limits, or retention rules granted to TTSData.

### Requirements

**Gate 1 — Technical Verification:**
- Inventory all approved applications, scopes, environments, and marketplaces
- Map each planned field to its official endpoint and authorization requirement
- Record pagination, rate limit, webhook, freshness, and retention constraints
- Distinguish partner-wide discovery data from seller-authorized first-party data
- Identify unavailable MVP fields and define their UI behavior
- Store links to the governing API documentation and policy version

**Gate 2 — Legal Review:**
- Review data retention, aggregation, commercialization, and user-rights conclusions
- Reconcile with applicable TikTok agreement

### Deliverable

Single document containing application type, marketplace, scopes, endpoint inventory, field mapping, rate limits, pagination, authorization lifecycle, retention, aggregation permissions, commercialization, unavailable fields, and account-type differences.

### Acceptance criteria

- [ ] Every proposed metric maps to a verified endpoint and field
- [ ] Granted scopes and marketplaces documented without secrets
- [ ] Controlled API probes confirm documented behavior
- [ ] Contractual and LGPD conclusions reviewed by qualified counsel
- [ ] Unsupported product claims removed from backlog

### Non-secret inputs required

- Application type (affiliate/creator/seller/partner)
- Granted scope names from TikTok Partner Center → Manage API
- Redacted portal screenshots
- API Testing Tool response fixtures (sanitized)
