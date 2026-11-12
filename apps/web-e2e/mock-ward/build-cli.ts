/** Builds the mock ward against an already-running local API: `tsx mock-ward/build-cli.ts`. */
import { buildMockWard } from './build';
import { applyLocalE2eEnv, localApiUrl, mockWardStatePath } from './env';

applyLocalE2eEnv();
const started = Date.now();
await buildMockWard(localApiUrl);
console.log(
  `Mock ward built in ${((Date.now() - started) / 1000).toFixed(1)}s → ${mockWardStatePath}`,
);
