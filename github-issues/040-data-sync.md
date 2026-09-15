## Labels
`data`, `backend`, `P0`
**Milestone:** `M0 — Foundation`
**Depends on:** #39

---

### User story

As the platform, I need to ingest user-authorized data so that we can enrich our aggregated dataset with real performance metrics.

### Requirements

- Sync only data permitted by granted scopes
- Raw payload retention conditional on #35 legal review
- Normalize money, currency, locale, timestamps, categories, identifiers
- Idempotent upserts (reprocessing same payload creates zero duplicates)
- Track entity tombstones or unavailable states
- Partial endpoint failure does not invalidate entire run
- Private tenant zone only

### Acceptance criteria

- [ ] One real account completes end-to-end sync
- [ ] Idempotent replay produces zero duplicates
- [ ] Partial failures handled gracefully
