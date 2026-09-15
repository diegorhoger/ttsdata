## Labels
`frontend`, `backend`, `product`, `P0`
**Milestone:** `M2 — Opportunity Intelligence`

---

### User story

As a user, I want to create alert rules that notify me when specific conditions are met so that I can act on opportunities quickly.

### Requirements

- Support triggers for score threshold, momentum, commission change, price change, saturation, and new content
- In-app delivery in MVP
- Cooldowns, deduplication, digest mode, quiet hours, timezone handling
- Record the observation and rule version that produced each alert
- Workspace-scoped deletion (cross-tenant safe)

### Acceptance criteria

- [ ] User can create, update, and delete alert rules
- [ ] Alert history shows delivered status
- [ ] Cross-tenant access prevented (workspaceId check on DELETE)
- [ ] All tests pass
- [ ] Typecheck passes
