## Labels
`frontend`, `backend`, `api`, `P0`
**Milestone:** `M0 — Foundation`
**Depends on:** #40, #52

---

### User story

As a connected user, I want to see my own performance data so that I understand my TikTok Shop results.

### Requirements

- Display every authorized metric supported for the connected account type
- Unavailable metrics explicitly identified, never synthesized
- Compare products, videos, time periods
- Show deterministic historical comparisons and change indicators
- CSV export for all beta users
- Clear separation between own data and any market data
- No inferred metrics presented as observed

### Acceptance criteria

- [ ] Connected user sees only authorized metrics
- [ ] Unavailable fields clearly marked
- [ ] No inferred data presented as observed
- [ ] CSV export works
