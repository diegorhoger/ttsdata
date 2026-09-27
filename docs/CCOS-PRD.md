# Creator Commerce Operating System (CCOS) — V1 PRD

## Product goal

Give a creator/operator one tenant-private operating system for moving a merchant relationship from invitation or prospecting through product receipt, content production, publication, performance review and follow-up. GitHub issues and pull requests remain the delivery source of truth.

## V1 boundary

CCOS V1 is provider-neutral and works with manual, self-reported and later verified API inputs. It does not require speculative TikTok Shop endpoints, market-wide rankings or autonomous merchant messaging.

## Canonical model

| Entity | Responsibility |
|---|---|
| Store/Brand | Durable merchant identity and contact context |
| Partnership | One commercial engagement with a store |
| Product/Sample | Logistics and production lifecycle for an offered item |
| Content | Independent creative lifecycle; many records may belong to one product |
| Interaction | Chronological inbound, outbound or system timeline event |
| Next Action | Explicit operational attention item or waiting state |
| Metric Snapshot | Time-stamped, provenance-bearing observed/calculated/inferred/self-reported/unavailable metric |

Every mutable record is scoped to a workspace. Parent-child relationships use workspace-aware foreign keys so a record cannot be attached to a parent from another tenant.

## Invariants

- A store can have multiple partnerships and a partnership can have multiple products.
- A product can have multiple concurrent or historical content records.
- `RECEIVED`, `CONTENT_QUEUE`, `IN_PRODUCTION`, `CONTENT_LIVE` and `MONITORING` are distinct operational states.
- Publishing content never implicitly completes a product or partnership.
- Operational status remains separate from later commercial-opportunity classification.
- Missing external data remains missing and is never fabricated or silently converted to zero.
- V1 communication is human initiated; lifecycle events may suggest a template but never send autonomously.

## Delivery sequence

1. `TTS-CCOS-00` — domain model, invariants and migrations.
2. `TTS-CCOS-01` — stores and partnerships.
3. `TTS-CCOS-02` — products, samples and logistics.
4. `TTS-CCOS-03` — content production.
5. `TTS-CCOS-04` — Next Action engine and attention inbox.
6. `TTS-CCOS-05` — timeline and versioned message templates.
7. `TTS-CCOS-06` — publication and ad-authorization tracking.
8. `TTS-CCOS-07` — performance snapshots and provenance.
9. `TTS-CCOS-08` — production prioritization.
10. `TTS-CCOS-09` — relationship follow-up and expansion.
11. `TTS-CCOS-10` — dashboard and end-to-end beta journey.

## Foundation exit criteria

- Generated migration creates the seven V1 entity families and lifecycle enums.
- Workspace-aware relationships reject cross-tenant writes at the database boundary.
- Repository reads always require workspace context and fail closed across tenants.
- Lifecycle transition rules are deterministic and tested.
- Migration metadata, typecheck and tests pass before merge.

## Migration and rollback strategy

The forward migration is generated and immutable once merged. Before production deployment it must be applied to a disposable copy of the production schema and followed by the tenant-isolation integration suite.

`packages/db/drizzle/rollback/0002_worried_lyja.down.sql` is the reviewed emergency rollback for this foundation slice. It removes only CCOS tables and CCOS-owned enum types, in dependency order; it does not modify pre-existing TTSData tables. Because rollback deletes CCOS data, production rollback requires a verified backup/export and explicit operator approval. The deployment gate must test forward migration, rollback, and forward re-application on PostgreSQL before release.
