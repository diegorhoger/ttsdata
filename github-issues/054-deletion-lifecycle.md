**Labels:** `security`, `backend`, `P0`
**Milestone:** `M1 — Authorized Data MVP`
**Depends on:** #39, #40, #52

---

## User story

As a user, I want to disconnect my account and delete my data so that I comply with LGPD (Brazil's privacy law) and retain control over my information.

## Requirements

- Disconnect immediately prevents new sync jobs
- Invoke official revocation when supported; delete local credentials in every case
- Cancel or reject all queued synchronization jobs
- Ensure no retained credential can authorize another request
- Record whether remote revocation was confirmed or unavailable
- Raw and normalized tenant data deleted according to policy
- Caches and materialized views invalidated
- Derived records recomputed or removed
- Backup expiration documented and tested
- Deletion is idempotent
- One tenant's deletion never affects another
- Completion record contains no deleted payloads

## Acceptance criteria

- [ ] Disconnect stops sync immediately
- [ ] Local credentials deleted in every case
- [ ] Remote revocation attempted and recorded
- [ ] Caches and materialized views invalidated
- [ ] Derived records recomputed or removed
- [ ] Deletion is idempotent
- [ ] Cross-tenant isolation maintained during deletion
- [ ] Completion record produced without retaining deleted payloads
- [ ] One tenant's deletion never affects another
- [ ] Backup expiration documented and tested
