# Phase 3 Prompt: Core Domain and Database Model

Implement the initial domain and Prisma schema for:

- Ward
- ApplicationUser
- Role
- Permission
- UserRole
- UserSession
- WardCodeVersion
- Person
- Household
- HouseholdMembership
- PersonRelationship
- ContactMethod
- ContactConsent
- AudienceGroup
- AudienceGroupMember
- CommunicationDestination
- AudienceDestination
- AuditEvent

Requirements:

- Use singular table names.
- Include created and updated timestamps.
- Use soft archive behavior where history matters.
- Do not physically delete records referenced by audit or delivery history.
- Keep household membership separate from person relationships.
- Support Husband, Wife, Son, Daughter, Parent, Child, Spouse, Guardian, Dependent, Other, and NotSpecified values without assuming one permanent family shape.
- Include Male, Female, and NotSpecified for initial gender values.
- Support many to many person to audience relationships.
- Support many to many audience to destination relationships.
- Add indexes for common search and join paths.
- Add unique constraints that prevent accidental duplication.
- Add seed data only for roles and permissions.
- Add schema documentation.
- Add migration tests or integration tests.

Before writing code, present the proposed entity relationship model and explain the important constraints.
