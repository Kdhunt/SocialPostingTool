# Phase 9 Prompt: External Provider Integrations

Implement providers one at a time.

Order:

1. Email
2. SMS
3. Facebook Page

For each provider:

- Create an adapter
- Keep SDK code out of the domain package
- Store only provider references in application records
- Encrypt or externally store credentials
- Handle expired credentials
- Handle rate limits
- Handle temporary failures
- Handle permanent failures
- Store provider message identifiers
- Prevent duplicates
- Add integration tests using provider test environments or contract mocks
- Document setup and permissions

Do not assume Facebook Group publishing is available.

Treat Facebook Page publishing permissions as capability driven.
