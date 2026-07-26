import type { CommunicationChannel, ConsentStatus, ContactMethodType } from '../enums.js';
import { mergeAudienceMemberships, type AudienceMembershipSet } from '../audiences/overlap.js';
import { computeRecipientIdempotencyKey } from './idempotency.js';

export type PersonChannel = 'Email' | 'Sms';

export interface ExpansionContactMethod {
  contactMethodId: string;
  personId: string;
  type: ContactMethodType;
  consentStatus: ConsentStatus;
  archivedAt: Date | null;
}

export interface ExpansionDestination {
  destinationId: string;
  channel: CommunicationChannel;
}

export interface ExpandedPersonRecipient {
  kind: 'person';
  channel: PersonChannel;
  personId: string;
  contactMethodId: string;
  destinationId: string;
  sourceAudienceGroupIds: string[];
  idempotencyKey: string;
}

export interface ExpandedPageRecipient {
  kind: 'page';
  channel: 'FacebookPage';
  destinationId: string;
  idempotencyKey: string;
}

export type ExpandedRecipient = ExpandedPersonRecipient | ExpandedPageRecipient;

export type SkipReason = 'no_contact_method' | 'no_consent';

export interface SkippedRecipient {
  personId: string;
  channel: PersonChannel;
  reason: SkipReason;
  sourceAudienceGroupIds: string[];
}

export interface ExpansionResult {
  recipients: ExpandedRecipient[];
  skipped: SkippedRecipient[];
}

export interface ExpandRecipientsInput {
  audienceMemberships: AudienceMembershipSet[];
  destinations: ExpansionDestination[];
  contactMethods: ExpansionContactMethod[];
}

const CONTACT_METHOD_TYPE_FOR_CHANNEL: Record<PersonChannel, ContactMethodType> = {
  Email: 'Email',
  Sms: 'Phone',
};

/**
 * Expands audiences + destinations into concrete delivery recipients.
 * Consent is never inferred (AGENTS.md #8). Overlap collapses via
 * mergeAudienceMemberships (AGENTS.md #7).
 */
export function expandDeliveryRecipients(input: ExpandRecipientsInput): ExpansionResult {
  const people = mergeAudienceMemberships(input.audienceMemberships);

  const contactMethodsByPerson = new Map<string, ExpansionContactMethod[]>();
  for (const method of input.contactMethods) {
    if (method.archivedAt !== null) continue;
    const list = contactMethodsByPerson.get(method.personId) ?? [];
    list.push(method);
    contactMethodsByPerson.set(method.personId, list);
  }

  const firstDestinationByChannel = new Map<PersonChannel, string>();
  for (const destination of input.destinations) {
    if (destination.channel === 'Email' || destination.channel === 'Sms') {
      if (!firstDestinationByChannel.has(destination.channel)) {
        firstDestinationByChannel.set(destination.channel, destination.destinationId);
      }
    }
  }

  const recipients: ExpandedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];

  for (const person of people) {
    for (const [channel, destinationId] of firstDestinationByChannel) {
      const contactType = CONTACT_METHOD_TYPE_FOR_CHANNEL[channel];
      const methodsOfType = (contactMethodsByPerson.get(person.personId) ?? []).filter(
        (method) => method.type === contactType,
      );
      const granted = methodsOfType.find((method) => method.consentStatus === 'Granted');

      if (!granted) {
        skipped.push({
          personId: person.personId,
          channel,
          reason: methodsOfType.length === 0 ? 'no_contact_method' : 'no_consent',
          sourceAudienceGroupIds: person.audienceGroupIds,
        });
        continue;
      }

      recipients.push({
        kind: 'person',
        channel,
        personId: person.personId,
        contactMethodId: granted.contactMethodId,
        destinationId,
        sourceAudienceGroupIds: person.audienceGroupIds,
        idempotencyKey: computeRecipientIdempotencyKey({
          channel,
          personId: person.personId,
          contactMethodId: granted.contactMethodId,
        }),
      });
    }
  }

  const seenPageDestinationIds = new Set<string>();
  for (const destination of input.destinations) {
    if (destination.channel !== 'FacebookPage') continue;
    if (seenPageDestinationIds.has(destination.destinationId)) continue;
    seenPageDestinationIds.add(destination.destinationId);
    recipients.push({
      kind: 'page',
      channel: 'FacebookPage',
      destinationId: destination.destinationId,
      idempotencyKey: computeRecipientIdempotencyKey({
        channel: 'FacebookPage',
        destinationId: destination.destinationId,
      }),
    });
  }

  return { recipients, skipped };
}
