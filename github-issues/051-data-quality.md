**Labels:** `data`, `observability`, `P0`
**Milestone:** `M0 — Foundation`

---

## User story

As the platform, I need provenance contracts, metric classifications, quality dimensions, and quarantine/replay mechanisms so that every metric is trustworthy and traceable.

## Requirements

- Define quality dimensions: freshness, completeness, accuracy, consistency
- Define SLIs per entity type
- Define provenance contract: source, retrieval time, marketplace, scope, classification
- Define metric classification: observed, calculated, inferred, self-reported, unavailable
- Define quarantine rules for malformed payloads
- Define replay requirements for dead-letter handling
- Block ranking when freshness or completeness falls below thresholds

## Implementation

### packages/data-quality/src/provenance.ts

- `DataProvenance` interface — source, endpoint, retrievedAt, marketplace, scopeContext, metricClassification
- `createObservedProvenance()`, `createCalculatedProvenance()`, `createInferredProvenance()`, `createUnavailableProvenance()`

### packages/data-quality/src/classification.ts

- `MetricClassification` type: observed, calculated, inferred, self-reported, unavailable
- Labels and descriptions for each classification

### packages/data-quality/src/quality.ts

- `QualityConfig` — maxAgeHours, minCompleteness, minAccuracy
- `calculateFreshness()`, `calculateCompleteness()`, `calculateAccuracy()`
- `generateQualityReport()` — combines all dimensions
- `isQualitySufficientForRanking()` — blocks ranking on fail

### packages/data-quality/src/quarantine.ts

- `QuarantineRecord<T>` interface — generic, no payload shape assumed
- `quarantineRecord()`, `canRetry()`, `getRetryDelay()`, `markForRetry()`, `markResolved()`, `markFailed()`
- `replayRecord()` — replays with exponential backoff

## Tests

All 32 data-quality tests pass:
- `tests/data-quality/provenance.test.ts` — 4 tests
- `tests/data-quality/classification.test.ts` — 4 tests
- `tests/data-quality/quality.test.ts` — 9 tests (including timing fixes)
- `tests/data-quality/quarantine.test.ts` — 12 tests

## Acceptance criteria

- [ ] Quality dimensions documented and versioned
- [ ] Provenance contract enforced on every material metric
- [ ] Malformed payloads quarantined without crashing
- [ ] Dead letters replayable with exponential backoff
- [ ] Ranking blocked when quality thresholds not met
- [ ] All 32 tests pass
