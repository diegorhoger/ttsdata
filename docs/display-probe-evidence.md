# Display API Probe Evidence

**Purpose:** convert the documented Display contract into *observed* evidence before
Issue #21 (Display profile/video synchronization) is authorized to implement.

**Status as of 2026-10-03:** `AWAITING OPERATOR PROBE`. No Display capability is
`PROBE_VERIFIED`. No scope is confirmed as granted. No live provider call has been made.

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
| `PROBE_VERIFIED` | Observed through a controlled authenticated provider call, sanitized and recorded |
| `DOC_VERIFIED` | Stated by current official TikTok documentation; NOT observed in a live call |
| `SCOPE_AVAILABLE` | Scope observed/configurable in the approved application environment, but not demonstrated by a successful authorization |
| `NOT_GRANTED` | Authorization completed and the scope was NOT included in the granted set |
| `NOT_OBSERVED` | Endpoint called successfully but the field was absent from the response |
| `UNAVAILABLE` | Not obtainable from this capability family, or excluded from scope by policy |
| `LEGAL_REVIEWED` | Data-use reviewed by qualified Brazilian counsel |

A capability may move `DOC_VERIFIED` → `PROBE_VERIFIED` only with recorded sanitized
evidence. Absence of an optional or ungranted field is itself evidence (`NOT_OBSERVED`
or `NOT_GRANTED`) and must never be recorded as zero, empty, or fabricated.

---

## Current evidence state

| # | Assertion | Classification |
|---|---|---|
| A1 | Display OAuth start → provider → callback completes end to end | `DOC_VERIFIED` |
| A2 | Granted scope set for the approved application | `SCOPE_AVAILABLE` (all four) |
| A3 | `user.info.basic` granted | `SCOPE_AVAILABLE` |
| A4 | `user.info.profile` granted | `SCOPE_AVAILABLE` |
| A5 | `user.info.stats` granted | `SCOPE_AVAILABLE` |
| A6 | `video.list` granted | `SCOPE_AVAILABLE` |
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
| G1 | Display-only family boundary (no Shop host/scope) | `PROBE_VERIFIED` — enforced in code and tested (`tests/display/capability.test.ts`) |

---

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
