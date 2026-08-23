import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServerlessHandler } from '../apps/api/src/serverless.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<unknown> {
  const nestHandler = await getServerlessHandler();
  return nestHandler(req, res);
}
