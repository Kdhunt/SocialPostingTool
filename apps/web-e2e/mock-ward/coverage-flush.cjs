/**
 * Loaded into every Node process of the local stack when measuring server
 * code coverage (see README: "How much of the server code the suite runs").
 * Playwright stops the API with a signal, which would discard V8's coverage
 * counters, so they are written out every ten seconds and on shutdown.
 */
const v8 = require('node:v8');

if (process.env.NODE_V8_COVERAGE) {
  setInterval(() => {
    try {
      v8.takeCoverage();
    } catch {
      // Coverage is a measurement aid: never let it stop the stack.
    }
  }, 10_000).unref();
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}
