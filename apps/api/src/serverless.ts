import serverlessExpress from '@codegenie/serverless-express';
import type { VercelApiHandler } from '@vercel/node';
import { createNestExpressApp } from './create-nest-app.js';

let cachedHandler: VercelApiHandler | undefined;

/**
 * Vercel serverless entry for the NestJS API. Reuses the Express app across
 * warm invocations to avoid cold-start module boot on every request.
 */
export async function getServerlessHandler(): Promise<VercelApiHandler> {
  if (!cachedHandler) {
    const expressApp = await createNestExpressApp();
    cachedHandler = serverlessExpress({ app: expressApp }) as VercelApiHandler;
  }
  return cachedHandler;
}
