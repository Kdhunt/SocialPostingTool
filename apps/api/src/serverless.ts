import type { VercelApiHandler } from '@vercel/node';
import { createNestExpressApp } from './create-nest-app.js';

let cachedHandler: VercelApiHandler | undefined;

/**
 * Vercel Node functions receive Node.js `req`/`res`, not an AWS Lambda event.
 * Pass those through to the Nest Express app and reuse the app across warm
 * invocations.
 */
export async function getServerlessHandler(): Promise<VercelApiHandler> {
  if (!cachedHandler) {
    const expressApp = await createNestExpressApp();
    cachedHandler = (req, res): void => {
      expressApp(req, res);
    };
  }
  return cachedHandler;
}
