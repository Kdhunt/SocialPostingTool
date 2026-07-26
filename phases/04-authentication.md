# Phase 4 Prompt: Authentication and Ward Code

Implement secure authentication.

Required behavior:

- Individual username and password
- Shared ward code
- Ward code required on first sign in per device
- Ward code required again after ward code rotation
- Password hashing
- Ward code hashing
- Rate limiting
- Account lockout or backoff
- Session expiration
- Logout
- Session revocation
- Audit events
- Administrator ability to disable an account

Create:

- API endpoints
- Application services
- Repositories
- Web login flow
- Mobile login flow
- Tests
- Security documentation

Do not expose password hashes or ward code hashes through API responses.

Do not use localStorage for browser authentication tokens.

Before coding, provide a threat model for the login flow.
