## Labels
`data`, `observability`, `P0`

## Milestone
`M0 — Foundation`

---

### User story

As the platform, I need provenance contracts, metric classifications, quality dimensions, and quarantine/replay mechanisms so that every metric is trustworthy and traceable.

### Requirements

- Define quality dimensions: freshness, completeness, accuracy, consistency
- Define SLIs per entity type
- Define provenance contract: source, retrieval time, marketplace, scope, classification
- Define metric classification: observed, calculated, inferred, self-reported, unavailable
- Define quarantine rules for malformed payloads
- Define replay requirements for dead-letter handling
- Block ranking when freshness or completeness falls below thresholds

### Acceptance criteria

- [ ] Quality dimensions documented and versioned
- [ ] Provenance contract enforced on every material metric
- [ ] Malformed payloads quarantined without crashing
- [ ] Dead letters replayable with exponential backoff
- [ ] Ranking blocked when quality thresholds not met
