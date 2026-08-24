import { afterEach, describe, expect, it, vi } from 'vitest';

const expressApp = vi.fn();

vi.mock('./create-nest-app.js', () => ({
  createNestExpressApp: vi.fn(async () => expressApp),
}));

describe('getServerlessHandler', () => {
  afterEach(() => {
    vi.resetModules();
    expressApp.mockReset();
  });

  it('forwards Vercel req and res to the Express app', async (): Promise<void> => {
    const { getServerlessHandler } = await import('./serverless.js');
    const handler = await getServerlessHandler();
    const req = { url: '/api/v1/auth/session' };
    const res = { statusCode: 200 };
    handler(req as never, res as never);
    expect(expressApp).toHaveBeenCalledWith(req, res);
  });
});
