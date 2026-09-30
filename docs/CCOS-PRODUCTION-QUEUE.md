# CCOS production queue — V1

`GET /api/ccos/production-queue` lists workspace products in `received` or
`content_queue`. Already-started, paused, terminal and logistics-only products are
excluded. Reading/reordering never changes a product, content or partnership status.

The default sort preserves explicit manual order; newly eligible products follow
scored products with stable ascending product-ID ties. Other `sort` values are
`score`, `commission`, `stock`, `performance`, `responsiveness` and `strategic`.
Filters are `priority`, `stockState`, and `missing=include|only|exclude`, optionally
restricted to one `signal`. Missing signal values always sort after known values;
known zero is not missing. Low scores are not an insufficient-data classification.

## Transparent policy: ccos-production-v1

| Component | Weight | Input and deterministic scaling |
| --- | ---: | --- |
| Commission | 25 | Product commission percentage, capped at 100; monetary amounts are not mixed across currencies |
| Stock | 20 | `in_stock` 100, `low_stock` 40, `out_of_stock` 0; unknown/unrecognized is missing |
| Performance | 25 | Latest product-content snapshot by observation time then snapshot ID; conversion ratio times 100 |
| Responsiveness | 10 | Recorded inbound share of all inbound/outbound partnership interactions times 100; explicitly a proxy, not response-time evidence |
| Strategic | 20 | Product priority: low 0, normal 33, high 67, urgent 100 |

Composite score is the weighted mean over available components, rounded to three
decimal places. `coverage` is the available weight out of 100, not confidence.
Every component exposes raw input, score, weight, source, classification,
provenance, observation time and freshness. Snapshot classifications remain intact;
inferred/self-reported evidence is not relabeled observed. No provider calls or
invented GMV are involved.

Freshness is explanatory in V1, not a hidden discount: observations older than
seven days at the returned `asOf` are labeled stale but still contribute. Product
fields have unknown observation age because their record-update time does not prove
the commercial signal was re-observed. The same signals/version produce the same
score/order; `asOf` affects snapshot eligibility and freshness labels only.

## Manual order and audit

`PUT /api/ccos/production-queue/order` is owner/admin only. Supply the GET response's
`expectedRevision`, `membershipToken`, every `eligibleIds` ID exactly once in the
desired `productIds` order, and a nonempty `reason`. Tenant and actor come from
authentication, never from request inputs. A revision or eligible-membership change
returns 409; invalid/foreign/duplicate/partial membership returns 400. Reload before
retrying. Queue size is explicitly capped at 1000; it is never silently truncated.

Reorder locks the workspace, state and products, atomically updates the revision
and order, and appends actor/before/after/reason to the audit journal. Product
lifecycle changes use the same workspace-first lock order. Departed products no
longer appear; stale configured IDs do not control newly eligible products.
`GET /api/ccos/production-queue/audit` returns the latest 100 tenant-private events.
Audit records block actor deletion until an explicit retention/export decision.

Migration 0008 includes the generated snapshot/journal and explicit CHECK SQL
(drizzle-kit 0.22 does not generate checks). The reviewed rollback removes only the
two queue tables and its product index. The PostgreSQL verifier validates forward
constraints and both isolation suites, rolls back all CCOS migrations, reapplies
them, and reruns both suites. It requires an isolated `*_test` database.
