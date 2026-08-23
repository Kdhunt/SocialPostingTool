import 'reflect-metadata';
import http from 'node:http';
import { loadConfig } from '@ward-comms/config';
import { createNestExpressApp } from './create-nest-app.js';

async function bootstrap(): Promise<void> {
  loadConfig();
  const expressApp = await createNestExpressApp();
  const config = loadConfig();
  const server = http.createServer(expressApp);
  await new Promise<void>((resolve) => {
    server.listen(config.api.port, config.api.host, () => resolve());
  });
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start @ward-comms/api', error);
  process.exitCode = 1;
});
