## Labels
`data`, `backend`, `P0`
**Milestone:** `M0 — Foundation`
**Depends on:** #40

---

### User story

As the platform, I need historical snapshots and provenance so that trend calculations are reproducible and auditable.

### Requirements

- Store scheduled snapshots for mutable metrics
- Generate change events for fields verified by #35
- Define deduplication, compaction, and retention policies
- Retain sufficient inputs to reproduce displayed trend calculations
- Attach provenance to every material metric

### Acceptance criteria

- [ ] Historical values queryable by entity and time window
- [ ] Unchanged snapshots compacted without losing trend integrity
