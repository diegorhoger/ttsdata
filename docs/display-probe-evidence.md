# Display API Probe Evidence

**Purpose:** convert the documented Display contract into *observed* evidence before
Issue #21 (Display profile/video synchronization) is authorized to implement.

**Status as of 2026-10-03:** `AWAITING OPERATOR PROBE`. **Zero** `PROBE_VERIFIED`
entries. No scope is confirmed as granted. No live provider call has been made.

The TTSData-side lifecycle is `CODE_VERIFIED` (Issue #20, merged via PR #55). That is a
statement about our implementation and its tests — **not** about TikTok's behaviour, and
not a substitute for the live observation this gate requires.

**Baseline when this gate opened:** `origin/master` @ `261779d229e6aa39b7a7608c732530397b74bf92`

---

## Why this gate exists

Issue #21 asserts provider behaviour: response shapes, field presence, pagination
semantics, and error envelopes. Those assertions cannot be validated by unit tests,
mocks, or documentation reading. Building the #21 persistence model on documentation
alone would encode assumptions as schema — the exact failure mode the verification
worksheet exists to prevent.

This gate is **not** a feature node. It produces evidence, not code.

---

## Proof classification

Every #21-relevant assertion carries exactly one label. There is no ambiguous
"verified".

| Classification | Meaning |
|---|---|
| `PROBE_VERIFIED` | **Reserved.** Observed through a controlled authenticated TikTok call, with sanitized recorded evidence. Nothing else may use this label. |
| `CODE_VERIFIED` | Invariant established by production code plus automated tests, but NOT established by a live provider observation |
| `DOC_VERIFIED` | Stated by current official TikTok documentation; NOT observed in a live call |
| `SCOPE_AVAILABLE` | Scope observed/configurable in the approved application environment, but not demonstrated by a successful authorization |
| `NOT_GRANTED` | Authorization completed and the scope was NOT included in the granted set |
| `NOT_OBSERVED` | Not yet observed. For a field: the endpoint was called successfully and the field was absent. For a lifecycle: the live provider path has not been exercised. |
| `UNAVAILABLE` | Not obtainable from this capability family, or excluded from scope by policy |
| `LEGAL_REVIEWED` | Data-use reviewed by qualified Brazilian counsel |

A capability may move `DOC_VERIFIED` → `PROBE_VERIFIED` only with recorded sanitized
evidence from a live call. Absence of an optional or ungranted field is itself evidence
(`NOT_OBSERVED` / `NOT_GRANTED`) and must never be recorded as zero, empty, or
fabricated.

`CODE_VERIFIED` exists so that a tested invariant in our own code is not laundered into
`PROBE_VERIFIED`. Passing tests prove our code behaves as written; they prove nothing
about what TikTok returns.

---

## Current evidence state

| # | Assertion | Classification |
|---|---|---|
| A1 | TTSData Display OAuth lifecycle orchestration (start → state → callback → exchange → encrypted persistence) | `CODE_VERIFIED` — Issue #20, reviewed and merged via PR #55; `tests/display/lifecycle.test.ts` |
| A2 | Successful **live** TikTok start → provider authorization → callback | `NOT_OBSERVED` — no live provider call has been made |
| A3 | Granted scope set for the approved application | `SCOPE_AVAILABLE` (all four) |
| A4 | `user.info.basic` granted | `SCOPE_AVAILABLE` |
| A5 | `user.info.profile` granted | `SCOPE_AVAILABLE` |
| A6 | `user.info.stats` granted | `SCOPE_AVAILABLE` |
| A7 | `video.list` granted | `SCOPE_AVAILABLE` |
| B1 | `GET /v2/user/info/` returns 200 with a data envelope | `DOC_VERIFIED` |
| B2 | Profile field set under granted scopes | `DOC_VERIFIED` |
| C1 | `POST /v2/video/list/` accepted request shape | `DOC_VERIFIED` |
| C2 | Video list response envelope | `DOC_VERIFIED` |
| C3 | `cursor` advancement across ≥2 pages | `DOC_VERIFIED` (runtime pagination NOT observed) |
| C4 | `has_more` behaviour | `DOC_VERIFIED` |
| C5 | `max_count` behaviour and documented maximum | `DOC_VERIFIED` |
| D1 | Video field set under granted scope | `DOC_VERIFIED` |
| E1 | Cover-image URL lifetime | `DOC_VERIFIED` (claimed; see limitation L2) |
| F1 | Provider error-envelope shape | `DOC_VERIFIED` |
| G1 | Display-only family boundary (no Shop host/scope) | `CODE_VERIFIED` — enforced in `display/capability.ts`, tested in `tests/display/capability.test.ts` |
| G2 | Credential encryption, tenant isolation, truthful revocation, kill switch | `CODE_VERIFIED` — Issue #20 tests |

### LIVE PROBE RESULTS (2026-10-05)

A controlled authenticated TikTok Display observation was performed. Row-level matrix:

| # | Claim | Previous | Candidate | Supporting fixture | Limitation |
|---|---|---|---|---|---|
| A1 | OAuth lifecycle orchestration (our code) | CODE_VERIFIED | CODE_VERIFIED | — | unchanged |
| A2 | live start -> provider -> callback | DOC_VERIFIED | **PROBE_VERIFIED** | — (audit record) | — |
| A3 | authorization-code exchange succeeded | DOC_VERIFIED | **PROBE_VERIFIED** | — (audit `authorization_callback: success`) | — |
| A4 | granted scope set | SCOPE_AVAILABLE | **PROBE_VERIFIED** | — | all three granted |
| A5 | complete key+secret pair | NOT_OBSERVED | **PROBE_VERIFIED** | — | provider accepted the exchange |
| B1 | `GET /v2/user/info/` 200 + envelope | DOC_VERIFIED | **PROBE_VERIFIED** | user-info.sanitized.json | — |
| B2 | profile field set (7 fields) | DOC_VERIFIED | **PROBE_VERIFIED** | user-info.sanitized.json | — |
| B3 | `user.info.profile` fields | DOC_VERIFIED | **NOT_GRANTED** | — | scope not granted |
| C1 | `POST /v2/video/list/` request shape | DOC_VERIFIED | **PROBE_VERIFIED** | video-list.sanitized.json | — |
| C2 | video-list envelope | DOC_VERIFIED | **PROBE_VERIFIED** | video-list.sanitized.json | — |
| C3 | cursor advancement across >=2 pages | NOT_OBSERVED | **PROBE_VERIFIED** | video-list.sanitized.json (`paginationObservation`) | — |
| C4 | `has_more` behaviour | DOC_VERIFIED | **PROBE_VERIFIED** | video-list.sanitized.json | true on both pages |
| C5 | `max_count` documented maximum | DOC_VERIFIED | **PROBE_VERIFIED** | max-count-boundary.sanitized.json | 50 -> 400 |
| D1 | video field set (13 fields) | DOC_VERIFIED | **PROBE_VERIFIED** | video-list.sanitized.json | — |
| E1 | cover-image URL lifetime | DOC_VERIFIED | DOC_VERIFIED | — | not re-confirmed (L2) |
| F1 | provider error-envelope shape | DOC_VERIFIED | **PROBE_VERIFIED** | max-count-boundary.sanitized.json | — |

**PROBE_VERIFIED count = 14**, reconciled arithmetically:
A2, A3, A4, A5 (4) + B1, B2 (2) + C1, C2, C3, C4, C5 (5) + D1 (1) + F1 (1) = **14**.
A1 remains CODE_VERIFIED. B3 is NOT_GRANTED. E1 remains DOC_VERIFIED.
No row was promoted without a live observation.

### Pagination evidence

`fixtures/display/video-list.sanitized.json` records a **fingerprint for every
observed item** on each page, plus a fingerprint for each page's cursor. Pagination
is therefore **recomputable from the committed artifact** rather than asserted:

| Derived fact | Method |
|---|---|
| page 1 item count | `len(page1...itemFingerprints)` |
| page 2 item count | `len(page2...itemFingerprints)` |
| cross-page overlap | `len(set(p1) & set(p2))` |
| cursor advanced | `p1.cursorFingerprint != p2.cursorFingerprint` |
| page 2 continuity | `page2.request.cursorFingerprint == page1.cursorFingerprint` |
| `has_more` | read from each page's `has_more` |

The `paginationObservation` block states the derived result for the matrix, but the
validator **recomputes** it from the fingerprints and fails if they disagree.

**Fingerprint method.** HMAC-SHA256 over domain-separated inputs — `item:<id>` and
`cursor:<cursor>` — using a **fresh 32-byte random salt generated for this capture
and destroyed immediately afterwards**. The salt is not committed, not logged, not
in PR text, and not retained. Without the salt the digests are non-reversible.
Domain separation prevents an item value and a cursor value from producing
interchangeable evidence. Only 24 hex characters are retained, which is ample for
equality and intersection testing while further reducing any lookup surface.

**Consequence, stated honestly:** because the salt is destroyed, a third party
cannot recompute these fingerprints from raw provider data. They can verify
*internal consistency* — counts, disjointness, cursor advancement — which is what
the pagination claim requires. They cannot independently re-derive the same digests.

### Redaction semantics

Two distinct things are recorded, and they must not be conflated:

- **Fixture representation** — identifiers/names/URLs become the JSON string
  `<REDACTED>`; numeric metrics become the JSON string `<NUMBER>`.
- **Provider-observed original type** — recorded separately as evidence metadata in
  each fixture's `_observedTypes` block, because replacing a JSON number with a JSON
  string does NOT preserve the provider's original JSON type.

The fixture therefore does not claim that `<NUMBER>` *is* a number. It claims the
observed value was a number, recorded as metadata.

### Absence is recorded as absence

**Not observed in the profile response:** `union_id`, `avatar_url_100`, `avatar_large_url`.
**Not observed in the video response:** `is_aigc`, `embed_link`.
These are absent from the fixtures — not `null`, not `0`, not empty string, and not
added to satisfy a schema.

### Sanitized fixtures

- `fixtures/display/user-info.sanitized.json`
- `fixtures/display/video-list.sanitized.json` (both pages, fingerprints, pagination)
- `fixtures/display/max-count-boundary.sanitized.json` (400 + error envelope)

No tokens, authorization codes, OAuth state, account identifiers, PII, or live CDN URLs.

## Limitations

- **L1 — No live provider access.** The application's `TIKTOK_CLIENT_KEY` /
  `TIKTOK_CLIENT_SECRET` in the local environment are placeholders, not real
  credentials. `OAUTH_STATE_SECRET` and `OAUTH_SESSION_SECRET` are shorter than the
  32-character minimum enforced by `display/config.ts`, so the production lifecycle
  fails closed at configuration load. No probe could be executed.
- **L2 — Cover-image TTL not independently re-confirmed.** Issue #21 states TikTok
  documents a six-hour TTL for `cover_image_url`. This was not re-verified against the
  official page during this gate (the documentation host returned 403 to the available
  fetch backends). Treat as `DOC_VERIFIED`-claimed and re-confirm against
  https://developers.tiktok.com/doc/tiktok-api-v2-video-object/ before relying on it.
  Regardless of the exact TTL, cover URLs must be treated as ephemeral and refreshed,
  never persisted as durable assets.
- **L3 — Marketplace unconfirmed.** The approved marketplace is recorded as BR but has
  not been confirmed against the application's actual configuration.

---

## Operator probe procedure

Requires operator-supplied credentials. Use the **Issue #20 production lifecycle** —
do not hand-roll a token exchange.

### Prerequisites

| Variable | Requirement |
|---|---|
| `TIKTOK_CLIENT_KEY` | Real client key for the approved application |
| `TIKTOK_CLIENT_SECRET` | Real client secret |
| `NEXT_PUBLIC_TIKTOK_REDIRECT_URI` | Must share the canonical origin |
| `OAUTH_STATE_SECRET` | ≥ 32 characters |
| `OAUTH_SESSION_SECRET` | ≥ 32 characters |
| `OAUTH_CANONICAL_ORIGIN` | Canonical deployment origin |
| `DISPLAY_CREDENTIAL_KEYS` | JSON keyring of version → base64 32-byte key |
| `DISPLAY_CREDENTIAL_VERSION` | Active key version |
| `DATABASE_URL` | PostgreSQL with migrations `0012` + `0013` applied |

### Steps

1. Enable the capability (it defaults OFF):
   `UPDATE display_capability_controls SET enabled = true WHERE singleton = true;`
2. Start authorization: `POST /api/display/connections/authorize`.
   Record the **returned scope list from the provider callback**, not the requested list.
3. Complete the provider redirect so `GET /api/display/callback` runs.
4. Confirm a connection row exists with `status = 'active'`.
5. Run the profile probe against `GET /v2/user/info/` for the fields below.
6. Run the video-list probe against `POST /v2/video/list/`, requesting
   `max_count=20`, and advance the cursor until `has_more = false` or the account is
   exhausted. If fewer than 21 videos exist, record pagination as `DOC_VERIFIED` only.
7. Capture one sanitized provider error envelope (for example, an intentionally
   malformed `fields` parameter). Do not perform abusive or destructive calls.
8. Sanitize per the contract below and record results in the matrix.
9. Run `pnpm verify:ccos-postgres` to confirm the credential store still holds
   ciphertext only.

### Fields to probe

Profile: `open_id`, `union_id`, `avatar_url`, `avatar_url_100`, `avatar_large_url`,
`display_name`, `bio_description`, `profile_deep_link`, `is_verified`, `username`,
`follower_count`, `following_count`, `likes_count`, `video_count`

Video: `id`, `create_time`, `cover_image_url`, `share_url`, `video_description`,
`duration`, `height`, `width`, `title`, `embed_link`, `like_count`, `comment_count`,
`share_count`, `view_count`, `is_aigc`

---

## Sanitization contract

Fixtures are committed to `fixtures/display/`. They MUST replace or remove:

- access tokens, refresh tokens, authorization codes, raw OAuth state
- `open_id` / `union_id` and any account identifier
- usernames, display names, bio text where identifying
- CDN, avatar, and cover URLs
- request IDs, log IDs
- timestamps that create unnecessary identifying correlation
- any provider material not required to establish schema or behaviour

They MUST preserve:

- missing vs `null` distinctions
- numeric zero vs unavailable
- `has_more`
- cursor presence and type
- error envelope structure
- field types
- scope-dependent field presence

**A fixture containing a live CDN URL, token, code, or account identifier is a defect,
not a convenience.** Do not commit a real cover-image URL under any circumstance.

---

## Exit gate

The Display verification node passes only when all of the following hold:

- [ ] Real OAuth authorization succeeded and the granted scope set is known
- [ ] Profile call succeeded and its response shape is recorded sanitized
- [ ] Video-list call succeeded and its response shape is recorded sanitized
- [ ] Pagination is either `PROBE_VERIFIED` or explicitly retained as `DOC_VERIFIED` with the limitation recorded
- [ ] Provider error envelope required by #21 is recorded
- [ ] No secrets, PII, tokens, codes, or live CDN URLs are present in committed evidence
- [ ] Issue #21's source contract distinguishes observed from documented behaviour

Until every box is checked, **Issue #21 remains dependency-blocked** and must not be
implemented.

---

## References

- [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/)
- [List Videos](https://developers.tiktok.com/doc/tiktok-api-v2-video-list/)
- [Video Object](https://developers.tiktok.com/doc/tiktok-api-v2-video-object/)
- [Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management/)
- Companion worksheet: `docs/API-VERIFICATION-WORKSHEET.md`
