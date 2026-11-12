/**
 * Starts the API for the local e2e stack with the mock-ward environment.
 * Used by playwright.local.config.ts; can also be run by hand for debugging.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { applyLocalE2eEnv, repoRoot } from './env';

const env = applyLocalE2eEnv();
const child = spawn('pnpm', ['exec', 'tsx', 'src/main.ts'], {
  cwd: path.join(repoRoot, 'apps', 'api'),
  env,
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
