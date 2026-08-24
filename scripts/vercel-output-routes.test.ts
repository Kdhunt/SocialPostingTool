import { describe, expect, it } from 'vitest';
import {
  API_ROUTES,
  FALLBACK_DEST,
  functionNameFromDest,
  functionNameFromFuncEntry,
  insertApiRoutes,
  isNestOptionalPeer,
  isObservabilityFunctionSymlink,
  isServerlessBundleExternal,
  isServerlessNativeExternal,
  nestOptionalPeerStubContents,
  remapRoutesToExistingFunctions,
  resolveServerlessBundleModule,
  SERVERLESS_NATIVE_EXTERNALS,
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

describe('SERVERLESS_NATIVE_EXTERNALS', () => {
  it('keeps Prisma and Argon2 external so NFT can copy native binaries', (): void => {
    expect(SERVERLESS_NATIVE_EXTERNALS).toEqual(
      expect.arrayContaining(['@node-rs/argon2', '@prisma/client', 'prisma']),
    );
  });

  it('does not leave reflect-metadata external', (): void => {
    expect(SERVERLESS_NATIVE_EXTERNALS).not.toContain('reflect-metadata');
    expect(isServerlessBundleExternal('reflect-metadata')).toBe(false);
  });

  it('stubs Nest optional peers instead of resolving them from node_modules', (): void => {
    expect(isNestOptionalPeer('class-validator')).toBe(true);
    expect(isNestOptionalPeer('class-transformer')).toBe(true);
    expect(isNestOptionalPeer('@nestjs/websockets/socket-module')).toBe(true);
    expect(isNestOptionalPeer('@nestjs/microservices/microservices-module')).toBe(true);
    expect(isServerlessNativeExternal('class-validator')).toBe(false);
    expect(nestOptionalPeerStubContents('class-validator')).toContain('MODULE_NOT_FOUND');
    expect(resolveServerlessBundleModule('class-validator')).toEqual({
      path: 'class-validator',
      namespace: 'nest-optional-peer',
    });
    expect(resolveServerlessBundleModule('@prisma/client')).toEqual({
      path: '@prisma/client',
      external: true,
    });
    expect(resolveServerlessBundleModule('reflect-metadata')).toBeUndefined();
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

describe('Nest optional peer stubs', () => {
  it('lets esbuild bundle Nest-style optional requires when packages are absent', async (): Promise<void> => {
    const esbuild = await import('esbuild');
    const result = await esbuild.build({
      stdin: {
        contents: `
          try { require('class-validator'); } catch {}
          try { require('class-transformer'); } catch {}
          try { require('@nestjs/websockets/socket-module'); } catch {}
          try { require('@nestjs/microservices/microservices-module'); } catch {}
          export const bundled = true;
        `,
        resolveDir: process.cwd(),
        sourcefile: 'optional-peers.ts',
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      plugins: [
        {
          name: 'serverless-native-and-nest-optional',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => resolveServerlessBundleModule(args.path));
            build.onLoad({ filter: /.*/, namespace: 'nest-optional-peer' }, (args) => ({
              contents: nestOptionalPeerStubContents(args.path),
              loader: 'js',
            }));
          },
        },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.outputFiles?.[0]?.text).toContain('MODULE_NOT_FOUND');
  });
});
