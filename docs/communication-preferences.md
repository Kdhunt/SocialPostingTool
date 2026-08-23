# Communication preferences and consent

Ward Communications Hub tracks **ward-local** communication consent in
`ContactConsent` (updated only through explicit API calls — never inferred
from audience membership or delivery history).

## Church Account subscriptions (separate system)

Members manage **Church Account** communication preferences (global LDS
Account subscriptions) at:

**https://account.churchofjesuschrist.org/subscriptions**

This application:

- **Does not** scrape, call, or integrate with that site programmatically.
- **Does not** infer Church Account subscription status into `ContactConsent`.
- **Does** append an informational footer to outbound Email and SMS linking
  to that URL so members know where to manage Church Account preferences
  separately from ward-local consent.

Ward-local consent and Church Account subscriptions are independent.
Granting ward-local consent does not imply any Church Account subscription
state, and vice versa.

## Outbound footers

Email and SMS bodies include a standard footer referencing the Church
Account subscriptions URL. See `docs/providers.md` and
`apps/worker/src/providers/communication-footer.ts`.
