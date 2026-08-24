import { describe, expect, it } from 'vitest';
import {
  API_ROUTES,
  FALLBACK_DEST,
  functionNameFromDest,
  functionNameFromFuncEntry,
  insertApiRoutes,
  isObservabilityFunctionSymlink,
  remapRoutesToExistingFunctions,
} from './vercel-output-routes.js';

describe('functionNameFromFuncEntry', () => {
  it('returns the Build Output function name for a top-level .func directory', (): void => {
    expect(functionNameFromFuncEntry('__fallback.func')).toBe('__fallback');
    expect(functionNameFromFuncEntry('api/nest.func')).toBe('api/nest');
    expect(functionNameFromFuncEntry('api\\cron\\process-schedules.func')).toBe(
      'api/cron/process-schedules',
    );
  });

  it('ignores nested .func copies traced into another function bundle', (): void => {
    expect(
      functionNameFromFuncEntry('api/nest.func/.vercel/output/functions/api/nest.func'),
    ).toBeUndefined();
  });

  it('ignores non-function paths', (): void => {
    expect(functionNameFromFuncEntry('__fallback')).toBeUndefined();
    expect(functionNameFromFuncEntry('index.mjs')).toBeUndefined();
    expect(functionNameFromFuncEntry('settings/security.func/.vc-config.json')).toBeUndefined();
  });
});

describe('isObservabilityFunctionSymlink', () => {
  it('matches top-level .func directories that are symlinks', (): void => {
    expect(isObservabilityFunctionSymlink('__nuxt_error.func', true)).toBe(true);
    expect(isObservabilityFunctionSymlink('login.func', true)).toBe(true);
  });

  it('leaves real function directories and nested copies alone', (): void => {
    expect(isObservabilityFunctionSymlink('__fallback.func', false)).toBe(false);
    expect(isObservabilityFunctionSymlink('api/nest.func', false)).toBe(false);
    expect(
      isObservabilityFunctionSymlink(
        'api/nest.func/.vercel/output/functions/api/nest.func',
        true,
      ),
    ).toBe(false);
  });
});

describe('functionNameFromDest', () => {
  it('strips leading slash and query string', (): void => {
    expect(functionNameFromDest('/index')).toBe('index');
    expect(functionNameFromDest('/__fallback?url=/')).toBe('__fallback');
    expect(functionNameFromDest('/api/nest')).toBe('api/nest');
  });
});

describe('remapRoutesToExistingFunctions', () => {
  const existing = new Set(['__fallback', 'api/nest']);

  it('rewrites dests that have no deployed function to __fallback', (): void => {
    const routes = remapRoutesToExistingFunctions(
      [
        { src: '/', dest: '/index' },
        { src: '/login', dest: '/login' },
        { src: '/api/v1/(.*)', dest: '/api/nest' },
        { src: '/(.*)', dest: '/__fallback' },
      ],
      existing,
    );

    expect(routes).toEqual([
      { src: '/', dest: FALLBACK_DEST },
      { src: '/login', dest: FALLBACK_DEST },
      { src: '/api/v1/(.*)', dest: '/api/nest' },
      { src: '/(.*)', dest: FALLBACK_DEST },
    ]);
  });

  it('leaves header and filesystem routes unchanged', (): void => {
    const routes = remapRoutesToExistingFunctions(
      [{ src: '/_nuxt/(.*)' }, { handle: 'filesystem' }],
      existing,
    );
    expect(routes).toEqual([{ src: '/_nuxt/(.*)' }, { handle: 'filesystem' }]);
  });

  it('throws when the fallback function is missing', (): void => {
    expect(() => remapRoutesToExistingFunctions([{ src: '/', dest: '/index' }], new Set())).toThrow(
      /__fallback/,
    );
  });
});

describe('insertApiRoutes', () => {
  it('inserts API routes immediately after the filesystem handle', (): void => {
    const routes = insertApiRoutes([
      { src: '/_nuxt/(.*)' },
      { handle: 'filesystem' },
      { src: '/', dest: '/index' },
      { src: '/(.*)', dest: FALLBACK_DEST },
    ]);

    expect(routes.slice(1, 1 + API_ROUTES.length + 1)).toEqual([
      { handle: 'filesystem' },
      ...API_ROUTES,
    ]);
    expect(routes.at(-1)).toEqual({ src: '/(.*)', dest: FALLBACK_DEST });
  });
});
