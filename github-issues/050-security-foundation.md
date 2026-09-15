## Labels
`security`, `backend`, `frontend`, `P0`

## Milestone
`M0 — Foundation`

---

### User story

As the platform, I need a secure authentication, tenant isolation, and authorization foundation so that user data is protected and cross-tenant access is impossible.

### Requirements

- Email-based authentication with secure session management
- Workspace model with roles: `owner`, `admin`, `analyst`, `viewer`
- Cross-tenant enforcement at repository/service layer (not just UI)
- Encryption-key management and rotation
- OAuth state/nonce and callback integrity validation
- Webhook signature verification and replay protection (only for webhook surfaces confirmed by capability matrix)
- Security audit events (login, logout, connection, disconnection)
- Secret redaction in logs and error reports
- Token revocation on disconnect
- Rate limiting and abuse controls

### Acceptance criteria

- [ ] Cross-tenant access tests fail closed
- [ ] Sessions can be revoked
- [ ] No token or secret appears in logs
- [ ] Role-based permissions enforced at service layer
- [ ] Input validation rejects malformed data
