## Labels
`frontend`, `backend`, `product`, `P0`
**Milestone:** `M2 — Opportunity Intelligence`

---

### User story

As a user, I want to save products, creators, shops, and videos to watchlists so that I can track them for future content.

### Requirements

- Create, rename, archive, and delete watchlists
- Save products, creators, shops, videos with entity-type-specific links
- Idempotent item addition (duplicate returns 409)
- Workspace-scoped access enforced on every route
- Plan-based limits enforced at service layer

### Acceptance criteria

- [ ] User can create, list, and delete watchlists
- [ ] Items can be added and removed
- [ ] Cross-tenant access is prevented
- [ ] Idempotent item addition (duplicate returns 409)
- [ ] All tests pass
- [ ] Typecheck passes
