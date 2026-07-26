# Cursor Review Prompt

Review the current branch against the project requirements.

Focus on:

- Architecture boundaries
- Authorization
- Privacy
- Minor data exposure
- Consent enforcement
- Audit coverage
- Transaction safety
- Idempotency
- Duplicate delivery risk
- Provider failure isolation
- Error handling
- Test coverage
- Database constraints
- Frontend and API contract mismatches

Do not make changes first.

Produce findings ordered by severity with:

- File and line
- Problem
- User impact
- Requirement violated
- Recommended fix
- Missing test

After the review, wait for explicit instruction before applying broad refactors.
