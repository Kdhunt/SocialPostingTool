import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CommunicationChannel } from '@prisma/client';

export interface SimulatedSendRequest {
  destinationId: string;
  channel: CommunicationChannel;
  text: string | null;
  imageAssetId: string | null;
}

export interface SimulatedSendResult {
  destinationId: string;
  status: 'simulated_sent';
  providerMessageId: string;
  sentAt: string;
}

/**
 * Local-development provider simulator (phases/07-campaigns.md: "Add a
 * provider simulator for local development" / "Do not call real providers
 * yet"). This deliberately does not implement retries, a dead-letter
 * queue, or idempotency keys — those belong to the Phase 8 delivery
 * engine, which is expected to replace or wrap this simulator with a real
 * queued, retried, idempotent send path. This service only proves that
 * campaign content resolves correctly per destination/audience/channel
 * and that a "send" can be attempted without ever touching a real email,
 * SMS, or Facebook API (no provider SDK is imported here — see
 * .cursor/rules/architecture.mdc: "use adapters for ... social").
 */
@Injectable()
export class CampaignProviderSimulatorService {
  send(request: SimulatedSendRequest): SimulatedSendResult {
    return {
      destinationId: request.destinationId,
      status: 'simulated_sent',
      providerMessageId: `simulated-${randomUUID()}`,
      sentAt: new Date().toISOString(),
    };
  }
}
