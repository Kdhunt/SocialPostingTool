# Phase 7 Prompt: Campaign Composition

Implement campaign drafting without external provider sending.

Entities:

- Campaign
- CampaignAudience
- CampaignVersion
- CampaignChannelVersion
- CampaignAsset
- CampaignDestination
- CampaignApproval
- CampaignSchedule

Required behavior:

- One base message
- One base image
- Multiple selected audiences
- Audience specific text override
- Audience specific image override
- Channel specific text
- Draft persistence
- Preview
- Validation
- Campaign status transitions
- Audit events

Initial channels:

- Email
- SMS
- Facebook Page

Do not call real providers yet.

Add a provider simulator for local development.

Add tests for:

- Missing content
- Empty audiences
- Archived destinations
- Overlapping audiences
- Audience version independence
- Invalid status transitions
