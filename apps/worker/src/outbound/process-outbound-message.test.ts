/**
 * Account emails (password reset, email confirmation): a sender that throws must leave the message ready to
 * retry, not stuck in "Sending", and one bad message must not stop the rest of a run. Uses a small in-memory
 * stand-in for the outbound_message table so the run sees only these fictional rows.
 */
import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@ward-comms/database';
import type { ProviderSendResult, TransactionalEmailAdapter } from '@ward-comms/domain';
import { processDueOutboundMessages, processOutboundMessage } from './process-outbound-message.js';

interface Row {
  id: string;
  toAddress: string;
  subject: string;
  body: string;
  idempotencyKey: string;
  status: 'Pending' | 'Sending' | 'Sent' | 'Failed';
  attemptCount: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  createdAt: Date;
}

function fakeOutboundTable(rows: Row[], options: { failReadOf?: string } = {}): PrismaClient {
  const byId = (id: string): Row | undefined => rows.find((row) => row.id === id);
  const isDue = (row: Row, now: Date): boolean => row.nextAttemptAt === null || row.nextAttemptAt <= now;
  return {
    outboundMessage: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === options.failReadOf) throw new Error('Fictional database error');
        const row = byId(where.id);
        return row ? { ...row } : null;
      },
      findMany: async ({ take }: { take: number }) =>
        rows
          .filter((row) => row.status === 'Pending' && isDue(row, new Date()))
          .slice(0, take)
          .map((row) => ({ id: row.id })),
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = byId(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return { ...row };
      },
      updateMany: async ({ where, data }: { where: { id: string; status: Row['status'] }; data: Partial<Row> }) => {
        const row = byId(where.id);
        if (!row || row.status !== where.status || !isDue(row, new Date())) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;
}

function message(id: string): Row {
  return {
    id,
    toAddress: `${id}@example.test`,
    subject: 'Reset your Ward Communications Hub password',
    body: 'Fictional reset link',
    idempotencyKey: `outbound:${id}`,
    status: 'Pending',
    attemptCount: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: new Date(),
  };
}

const sends: string[] = [];
const workingSender: TransactionalEmailAdapter = {
  async send(request): Promise<ProviderSendResult> {
    sends.push(request.toAddress);
    return { success: true, providerMessageId: `fake-${request.toAddress}` };
  },
};

describe('processOutboundMessage', () => {
  it('turns a sender that throws into a scheduled retry instead of leaving the email in Sending', async () => {
    const row = message('reset-1');
    const retries: Array<{ id: string; delayMs: number }> = [];
    const throwingSender: TransactionalEmailAdapter = {
      async send(): Promise<ProviderSendResult> {
        throw new TypeError('fetch failed');
      },
    };

    const outcome = await processOutboundMessage(
      {
        prisma: fakeOutboundTable([row]),
        email: throwingSender,
        enqueueRetry: async (id, delayMs) => {
          retries.push({ id, delayMs });
        },
      },
      row.id,
    );

    expect(outcome).toBe('retry_scheduled');
    expect(row.status).toBe('Pending');
    expect(row.attemptCount).toBe(1);
    expect(row.nextAttemptAt).toBeInstanceOf(Date);
    expect(row.lastError).toBe('The email provider call failed unexpectedly (TypeError).');
    expect(row.body).toBe('Fictional reset link');
    expect(retries).toEqual([{ id: 'reset-1', delayMs: expect.any(Number) as number }]);
  });
});

describe('processDueOutboundMessages', () => {
  it('still sends the other emails when one fails, then reports the failure', async () => {
    sends.length = 0;
    const rows = [message('first'), message('broken'), message('last')];
    const run = processDueOutboundMessages({
      prisma: fakeOutboundTable(rows, { failReadOf: 'broken' }),
      email: workingSender,
      enqueueRetry: async () => undefined,
    });

    await expect(run).rejects.toThrow('Fictional database error');
    expect(sends).toEqual(['first@example.test', 'last@example.test']);
    // The failed read happens before the claim, so the broken message stays Pending for the next run.
    expect(rows.map((row) => row.status)).toEqual(['Sent', 'Pending', 'Sent']);
  });

  it('returns the number sent when every email goes through', async () => {
    sends.length = 0;
    const rows = [message('a'), message('b')];
    const processed = await processDueOutboundMessages({
      prisma: fakeOutboundTable(rows),
      email: workingSender,
      enqueueRetry: async () => undefined,
    });
    expect(processed).toBe(2);
    expect(rows.every((row) => row.status === 'Sent')).toBe(true);
  });
});
