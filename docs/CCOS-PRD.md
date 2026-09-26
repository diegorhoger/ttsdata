# CCOS — Creator Commerce Operating System PRD

**Status:** Proposed  
**Product:** TTSData  
**System:** CCOS (Creator Commerce Operating System)  
**Source of truth:** GitHub Issues define requirements and acceptance criteria; Pull Requests define implementation and verification evidence. This document defines product intent and architecture, but does not supersede an accepted Issue or merged PR.

## 1. Product thesis

TTSData should evolve from creator/market intelligence into an operating system that helps creators manage the full commercial lifecycle with stores and brands: opportunity → partnership → sample → production → publication → ad authorization → performance → repeat content/replenishment/expansion.

The system must answer three operational questions:
1. What needs attention now?
2. What should the creator produce next?
3. Which commercial relationships/products deserve continued investment?

CCOS is not merely a CRM or Kanban board. It joins relationship management, content operations, commerce performance, and next-action orchestration.

## 2. Goals

- Make every active partnership auditable and actionable.
- Prevent products, messages, ad codes, follow-ups, and replenishment opportunities from being lost.
- Preserve one-to-many relationships: store → partnerships → products → content.
- Continue the lifecycle after publication instead of treating a posted video as completion.
- Use performance data to prioritize future production and commercial actions.
- Keep human operators in control of outbound communication and commercial decisions.
- Reuse TTSData's existing provenance, authorization, tenancy, data-quality, and historical-snapshot principles.

## 3. Non-goals for V1

- Fully autonomous merchant messaging.
- Autonomous acceptance of commercial terms.
- Automatic claims that a product is a "winner" without defined evidence.
- Dependence on unverified TikTok Shop endpoints or unavailable scopes.
- Replacing GitHub Issues/PRs with this document as implementation truth.
- Building all scoring/AI automation before the deterministic workflow is proven.

## 4. Core domain model

### Store / Brand
Commercial counterparty. Fields include identity, shop URL, contacts, relationship status, notes, last contact and next action.

### Partnership
A commercial engagement with a store. Types may include inbound invite, outbound prospecting, affiliate, paid campaign, and gifting. Stores may have multiple partnerships.

### Product / Sample
A product attached to a partnership, with SKU/link, price, commission terms, stock state, sample/logistics state, tracking, receipt timestamp, priority and lifecycle status.

### Content
A discrete creative asset attached to a product. A product may have many contents. Each content records platform, format/concept/hook, production state, publication URL/date, ad authorization/code and expiry, and attributable performance where available.

### Interaction
Immutable/auditable record of merchant-facing communication or material relationship event, including direction, channel, template/version when applicable, timestamps and related entities.

### NextAction
A due piece of work attached to an entity, with action type, owner, due time, priority, state and whether it was generated automatically.

### MetricSnapshot
Time-series observation for content/product performance. Metrics must retain classification/provenance consistent with TTSData's existing data rules.

## 5. Lifecycles

### Partnership phases
LEAD → NEGOTIATION → LOGISTICS → PRODUCTION → PUBLICATION → PERFORMANCE → RELATIONSHIP

These are high-level phases, not a substitute for entity-specific state.

### Product/sample state
PROPOSED → SELECTED → SAMPLE_REQUESTED → SAMPLE_APPROVED → SHIPPED → RECEIVED → CONTENT_QUEUE → IN_PRODUCTION → CONTENT_LIVE → MONITORING

Exceptional states: DECLINED, CANCELLED, OUT_OF_STOCK, REPLACEMENT_NEEDED, PAUSED, COMPLETED.

### Content state
IDEA → PLANNED → FILMING → EDITING → READY → SCHEDULED → PUBLISHED → ADS_AUTHORIZED → MONITORING

Publication is not partnership completion.

### Commercial opportunity state
UNASSESSED, TESTING, LOW_POTENTIAL, PROMISING, WINNER, SCALE, PAUSED.

Operational state and opportunity state must remain separate.

## 6. Next Action engine

Every active partnership/product/content must have either:
- a valid open next action, or
- an explicit waiting/terminal reason.

Deterministic V1 transitions should generate actions such as:
- sample approved → wait/track shipment
- shipped → monitor delivery
- received → confirm receipt + queue production
- content ready → publish
- published → send link/ad authorization when applicable
- ad authorization sent → schedule performance review
- strong performance signal → review additional creative
- replenishment threshold → review/request replacement
- merchant inactivity → follow-up

Automation must be idempotent and must not silently duplicate tasks/messages.

## 7. Communication system

V1 standard communication moments:
1. first contact / invite response
2. partnership confirmation
3. sample confirmation
4. product received
5. first content published
6. ad authorization/code shared
7. subsequent content + authorization
8. performance / continuity / replenishment

Templates are versioned suggestions. V1 does not send merchant messages autonomously. Sending/copying/marking-sent must create an interaction record.

## 8. Interaction timeline

Each store and partnership must expose a chronological timeline combining material state transitions, logistics, publications, ad authorizations, performance events, tasks and merchant communications. Timeline events must link back to their source entity.

## 9. Production prioritization

V1 supports explicit/manual priority plus deterministic sortable signals such as commission attractiveness, stock availability, observed conversion/performance, merchant responsiveness and strategic priority.

Later versions may produce a versioned Production Priority Score. Any score must expose components, input timestamps, missing-data behavior, confidence/provenance, and model/formula version. Missing data must not silently become zero.

## 10. Performance and snapshots

Do not overwrite the only copy of mutable metrics. Store time-stamped observations sufficient to show 24h/48h/7d/30d development when the source permits it.

Potential metrics include views, clicks, orders, GMV, commission and conversion rate. Every displayed metric must be labeled according to existing TTSData classification/provenance rules and must not be synthesized when unavailable.

## 11. UX / information architecture

Primary navigation target:
- Inbox / Attention
- Partnerships
- Products
- Production
- Content
- Performance
- Brands

Home is operational first. It should surface overdue replies, newly received products, content awaiting publication/ad authorization, production queue, performance signals, replenishment and follow-up opportunities.

The canonical store/partnership detail view includes current state, next action, related products/content, commercial terms where permitted, and unified timeline.

## 12. V1 end-to-end journey

Invitation/Lead → Partnership → Product/Sample → Received → Production → Published → Ad Authorization → Performance Review → Follow-up/Repeat/Replenishment.

V1 requires:
- stores/brands
- partnerships
- products/samples
- content
- entity state machines
- next actions
- versioned message templates
- interaction history
- production queue
- basic performance snapshots
- workspace isolation and auditability

## 13. Later phases

### V2
- automated performance signals
- stock/commission change monitoring where authorized
- smarter follow-up recommendations
- deterministic/AI-assisted production prioritization
- message generation
- integrations for supported commerce data

### V3
- creator commerce decision layer that recommends what to film, which products warrant another creative, which merchants warrant follow-up, and where replenishment/expansion opportunities exist
- recommendations remain explainable and source-backed

## 14. Security, tenancy and provenance invariants

- Every mutable CCOS entity is workspace-scoped.
- Cross-tenant reads/writes fail closed.
- Commercial metrics retain source, retrieval/observation time, marketplace/context and classification.
- No unverified external API field is treated as available.
- Sensitive credentials never enter CCOS domain records.
- State transitions and generated actions are auditable.
- Deletion/disconnection behavior must respect existing TTSData retention and provider constraints.

## 15. GitHub delivery contract

GitHub is the implementation source of truth.

- **PRD:** product intent, shared vocabulary, boundaries and target architecture.
- **Issues:** executable requirement slices, dependencies, acceptance criteria and priority.
- **PRs:** implementation, tests, migration/rollback evidence, screenshots or API evidence where applicable, and explicit issue closure/linkage.
- No feature is considered implemented because the PRD describes it.
- Scope changes discovered during implementation must update the governing Issue before/with the PR.
- PRs must state what they change, what they do not change, verification performed, data/API assumptions, and unresolved gates.
- Merge requires independent review under the repository's prevailing review discipline.

## 16. Proposed implementation issue map

- CCOS-00 — Foundation: domain model, invariants and migrations
- CCOS-01 — Store/brand and partnership management
- CCOS-02 — Product/sample lifecycle and logistics
- CCOS-03 — Content production lifecycle
- CCOS-04 — Next Action engine and attention inbox
- CCOS-05 — Interaction timeline and message templates
- CCOS-06 — Publication and ad-authorization tracking
- CCOS-07 — Performance snapshots and provenance
- CCOS-08 — Production queue and deterministic prioritization
- CCOS-09 — Relationship follow-up, replenishment and expansion
- CCOS-10 — CCOS dashboard and end-to-end beta journey

Each issue must be independently reviewable and should avoid coupling to unverified TikTok Shop API capabilities.

## 17. V1 success criteria

- A creator can operate a partnership from invitation through follow-up without an external spreadsheet.
- Every active partnership has a visible next action or explicit waiting reason.
- One store supports multiple partnerships/products; one product supports multiple contents.
- Publication does not destroy or close the commercial lifecycle.
- Every published content can independently track URL, ad authorization and performance.
- Performance history is time-based and provenance-aware.
- Operators can identify received products awaiting production, published content missing follow-up, and products needing another commercial action.
- The complete core journey is tenant-safe, tested, auditable and usable without speculative external API assumptions.

## 18. Open product questions

These are intentionally deferred to Issues/validation rather than guessed into code:
- exact merchant-channel integrations and permissions
- exact TikTok Shop ad-authorization API availability
- production-priority weighting
- thresholds for PROMISING/WINNER/SCALE
- automatic replenishment thresholds
- retention policy for interaction/message bodies
- whether CCOS should support non-TikTok platforms in V1 or only preserve provider-neutral schema boundaries
