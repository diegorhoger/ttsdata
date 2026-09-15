## Labels
`data`, `backend`, `product`, `P0`
**Milestone:** `M2 — Historical Data`
**Depends on:** #52, #53

---

### User story

As a user, I want private recommendations using only my authorized history so that I get personalized insights.

### Requirements

- Version every model (formula, weights, cohort definition)
- Store component scores, input observation times, confidence, explanation
- Missing data produces `unknown` or reduced confidence, never silently zero
- Reproducible: same version + inputs = same output
- Block ranking when freshness or completeness falls below thresholds

### Acceptance criteria

- [ ] Same version and inputs always produce same output
- [ ] Low-confidence rankings visibly marked
- [ ] Ranking blocked when data quality insufficient
