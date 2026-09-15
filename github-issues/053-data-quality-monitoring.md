## Labels
`observability`, `data`, `backend`, `P0`
**Milestone:** `M2 — Historical Data`
**Depends on:** #40, #51

---

### User story

As the platform, I need data quality monitoring and quarantine so that rankings are based on trustworthy data.

### Requirements

- Schema-drift detection
- Source freshness tracking
- Completeness by entity and field
- Counter-reset and outlier detection
- Quarantine for malformed payloads
- Replayable dead-letter handling
- Provenance for every commercial metric
- Block ranking when freshness or completeness falls below thresholds

### Acceptance criteria

- [ ] Data quality metrics visible to operators
- [ ] Malformed payloads quarantined
- [ ] Dead letters replayable
