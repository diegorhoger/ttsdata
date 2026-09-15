## Labels
`api`, `backend`, `security`, `P0`
**Milestone:** `M0 — Foundation`

---

### User story

As a user, I want to connect my TikTok Shop account so that I can see my own performance data and contribute to the platform's insights.

### Requirements

- Implement TikTok Shop OAuth 2.0 flow
- Request minimal scopes based on capability matrix
- Store encrypted tokens at rest
- Handle token refresh per TikTok's documented mechanism
- Validate state/nonce and callback integrity
- Revoke tokens on disconnect
- Never log tokens or authorization codes

### Acceptance criteria

- [ ] Authorization succeeds
- [ ] State/callback validation succeeds
- [ ] Tokens encrypted at rest
- [ ] Refresh works
- [ ] Revocation stops jobs
- [ ] Disconnect works
- [ ] Tokens never appear in logs
