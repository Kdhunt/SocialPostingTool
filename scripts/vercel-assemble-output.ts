import { Dirent } from 'node:fs';
import { access, cp, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nodeFileTrace } from '@vercel/nft';
import esbuild from 'esbuild';
import {
  API_ROUTES,
  FALLBACK_FUNCTION_NAME,
  functionNameFromFuncEntry,
  generatedPrismaClientCandidates,
  insertApiRoutes,
  isObservabilityFunctionSymlink,
  NEST_OPTIONAL_PEER_NAMESPACE,
  nestOptionalPeerStubContents,
  remapRoutesToExistingFunctions,
  resolveServerlessBundleModule,
  SERVERLESS_NATIVE_EXTERNALS,
} from './vercel-output-routes.js';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, '.vercel/output');
const CONFIG_PATH = path.join(OUTPUT_DIR, 'config.json');
/** When Vercel Root Directory is `apps/api`, Build Output must live here. */
const API_ROOT_OUTPUT_DIR = path.join(ROOT, 'apps/api/.vercel/output');


interface FunctionSpec {
  entry: string;
  /** Build Output API function name, e.g. `api/nest` → `functions/api/nest.func` */
  name: string;
  maxDuration: number;
  memory: number;
}

const API_FUNCTIONS: FunctionSpec[] = [
  { entry: 'api/nest.ts', name: 'api/nest', maxDuration: 60, memory: 1024 },
  { entry: 'api/cron/process-schedules.ts', name: 'api/cron/process-schedules', maxDuration: 300, memory: 1024 },
  {
    entry: 'api/cron/process-delivery-queue.ts',
    name: 'api/cron/process-delivery-queue',
    maxDuration: 300,
    memory: 1024,
  },
];

async function copyTracedFiles(fromRoot: string, fileList: Set<string>, destRoot: string): Promise<void> {
  for (const relativeFile of fileList) {
    const source = path.join(fromRoot, relativeFile);
    const target = path.join(destRoot, relativeFile);
    try {
      const stat = await lstat(source);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(source, target, {
        force: true,
        dereference: true,
        recursive: stat.isDirectory(),
      });
    } catch {
      // Optional traced paths (platform-specific) can be skipped locally.
    }
  }
}

const NATIVE_RUNTIME_PATHS = [
  'node_modules/@prisma/client',
  'node_modules/.prisma',
  'node_modules/@node-rs/argon2',
  'packages/database/node_modules/@prisma/client',
  'packages/database/node_modules/.prisma',
];

async function copyNativeRuntimePackages(funcDir: string): Promise<void> {
  for (const relative of NATIVE_RUNTIME_PATHS) {
    const source = path.join(ROOT, relative);
    if (!(await pathExists(source))) {
      continue;
    }
    const target = path.join(funcDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, dereference: true, force: true });
  }

  await copyGeneratedPrismaClient(funcDir);
  await copyArgon2NativePackages(funcDir);
}

async function copyGeneratedPrismaClient(funcDir: string): Promise<void> {
  const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
  let pnpmEntries: string[] = [];
  try {
    pnpmEntries = await readdir(pnpmDir);
  } catch {
    pnpmEntries = [];
  }

  let source: string | undefined;
  for (const candidate of generatedPrismaClientCandidates(ROOT, pnpmEntries)) {
    if (await pathExists(path.join(candidate, 'client', 'default.js'))) {
      source = candidate;
      break;
    }
  }

  if (!source) {
    throw new Error(
      'Generated Prisma client not found (.prisma/client/default.js). Run prisma generate before assembling Vercel functions.',
    );
  }

  const target = path.join(funcDir, 'node_modules', '.prisma');
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, dereference: true, force: true });
}

async function copyArgon2NativePackages(funcDir: string): Promise<void> {
  const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
  let pnpmEntries: string[] = [];
  try {
    pnpmEntries = await readdir(pnpmDir);
  } catch {
    return;
  }

  const scopedTarget = path.join(funcDir, 'node_modules', '@node-rs');
  for (const entry of pnpmEntries) {
    if (!entry.startsWith('@node-rs+argon2')) {
      continue;
    }
    const scopedSource = path.join(pnpmDir, entry, 'node_modules', '@node-rs');
    if (!(await pathExists(scopedSource))) {
      continue;
    }
    const names = await readdir(scopedSource);
    for (const name of names) {
      const from = path.join(scopedSource, name);
      const to = path.join(scopedTarget, name);
      await mkdir(path.dirname(to), { recursive: true });
      await cp(from, to, { recursive: true, dereference: true, force: true });
    }
  }
}

async function buildServerlessFunction(spec: FunctionSpec): Promise<void> {
  const entryPath = path.join(ROOT, spec.entry);
  const funcDir = path.join(OUTPUT_DIR, 'functions', `${spec.name}.func`);
  const handlerPath = path.join(funcDir, 'index.js');

  await mkdir(funcDir, { recursive: true });

  // CommonJS so external Prisma/Argon2 named exports resolve via require().
  // ESM output crashed with: Named export 'Prisma' not found (CJS module).
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: handlerPath,
    absWorkingDir: ROOT,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    mainFields: ['main', 'module'],
    conditions: ['node', 'require'],
    external: SERVERLESS_NATIVE_EXTERNALS,
    plugins: [
      {
        name: 'serverless-native-and-nest-optional',
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => resolveServerlessBundleModule(args.path));
          build.onLoad({ filter: /.*/, namespace: NEST_OPTIONAL_PEER_NAMESPACE }, (args) => ({
            contents: nestOptionalPeerStubContents(args.path),
            loader: 'js',
          }));
        },
      },
    ],
    sourcemap: true,
    logLevel: 'warning',
  });

  const { fileList } = await nodeFileTrace([handlerPath], { base: ROOT });
  await copyTracedFiles(ROOT, fileList, funcDir);
  await copyNativeRuntimePackages(funcDir);

  await writeFile(
    path.join(funcDir, '.vc-config.json'),
    JSON.stringify(
      {
        runtime: 'nodejs20.x',
        handler: 'index.js',
        launcherType: 'Nodejs',
        shouldAddHelpers: true,
        maxDuration: spec.maxDuration,
        memory: spec.memory,
      },
      null,
      2,
    ),
  );

  console.log(`  bundled ${spec.name}`);
}

async function listDeployableFunctions(): Promise<Set<string>> {
  const functionsDir = path.join(OUTPUT_DIR, 'functions');
  const names = new Set<string>();
  let entries: string[];
  try {
    entries = await readdir(functionsDir, { recursive: true });
  } catch {
    return names;
  }

  for (const entry of entries) {
    const name = functionNameFromFuncEntry(entry);
    if (!name) {
      continue;
    }
    const fullPath = path.join(functionsDir, entry);
    const stat = await lstat(fullPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      continue;
    }
    names.add(name);
  }

  return names;
}

async function patchOutputConfig(): Promise<void> {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw) as { version: number; routes: Array<Record<string, string>> };
  const existingFunctions = await listDeployableFunctions();

  config.routes = remapRoutesToExistingFunctions(config.routes, existingFunctions);
  config.routes = insertApiRoutes(config.routes, API_ROUTES);
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(
    `  patched config.json (${API_ROUTES.length} API routes, ${config.routes.length} total; functions: ${[...existingFunctions].join(', ')})`,
  );
  for (const route of config.routes) {
    const src = route.src ?? route.handle ?? '(unnamed)';
    const dest = route.dest ? ` → ${route.dest}` : '';
    console.log(`    ${src}${dest}`);
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * List `*.func` directories without following observability symlinks.
 * Recursive `readdir` follows those links and then `lstat`s nested files
 * like `settings/security.func/.vc-config.json` after the parent is gone.
 */
async function listFuncDirectoryPaths(functionsDir: string): Promise<string[]> {
  const found: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let dirents: Dirent[];
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const dirent of dirents) {
      const relative = prefix.length > 0 ? `${prefix}/${dirent.name}` : dirent.name;
      if (dirent.name.endsWith('.func')) {
        found.push(relative);
        continue;
      }
      if (dirent.isSymbolicLink() || !dirent.isDirectory()) {
        continue;
      }
      await walk(path.join(dir, dirent.name), relative);
    }
  }

  await walk(functionsDir, '');
  return found;
}

/**
 * Drop Nitro observability `*.func` symlinks. Vercel deserializes them via
 * `applyFunctionSymlinks`, which fails when `readlink` is an absolute path
 * (lookup `…/functions/__fallback` instead of `__fallback`).
 */
async function removeObservabilityFunctionSymlinks(): Promise<void> {
  const functionsDir = path.join(OUTPUT_DIR, 'functions');
  const entries = await listFuncDirectoryPaths(functionsDir);
  const removed: string[] = [];

  for (const entry of entries) {
    if (functionNameFromFuncEntry(entry) === undefined) {
      continue;
    }
    const fullPath = path.join(functionsDir, entry);
    let isSymbolicLink = false;
    try {
      const stat = await lstat(fullPath);
      isSymbolicLink = stat.isSymbolicLink();
    } catch (error) {
      if (isEnoent(error)) {
        continue;
      }
      throw error;
    }
    if (!isObservabilityFunctionSymlink(entry, isSymbolicLink)) {
      continue;
    }
    await rm(fullPath, { recursive: true, force: true });
    removed.push(entry.replaceAll('\\', '/'));
  }

  if (removed.length > 0) {
    console.log(
      `  removed ${String(removed.length)} observability function symlink(s): ${removed.join(', ')}`,
    );
  }
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'ENOENT'
  );
}

/**
 * Vercel only reads Build Output API from `<Root Directory>/.vercel/output`.
 * Do not set `outputDirectory` in vercel.json — that treats the folder as a
 * static export and every route returns platform NOT_FOUND.
 */
async function publishBuildOutputForVercelRoot(): Promise<void> {
  await rm(API_ROOT_OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.dirname(API_ROOT_OUTPUT_DIR), { recursive: true });
  await cp(OUTPUT_DIR, API_ROOT_OUTPUT_DIR, { recursive: true });
  console.log('  published Build Output to apps/api/.vercel/output (apps/api Root Directory)');
}

async function verifyDeployOutput(): Promise<void> {
  const repoRootConfig = path.join(OUTPUT_DIR, 'config.json');
  const apiRootConfig = path.join(API_ROOT_OUTPUT_DIR, 'config.json');

  if (!(await pathExists(repoRootConfig))) {
    throw new Error('Missing Build Output at .vercel/output/config.json');
  }

  const fallbackFunc = path.join(OUTPUT_DIR, 'functions', `${FALLBACK_FUNCTION_NAME}.func`);
  if (!(await pathExists(fallbackFunc))) {
    throw new Error(
      `Missing ${FALLBACK_FUNCTION_NAME} Lambda at .vercel/output/functions/${FALLBACK_FUNCTION_NAME}.func`,
    );
  }

  if (process.env.VERCEL === '1') {
    if (!(await pathExists(apiRootConfig))) {
      throw new Error('Missing Build Output at apps/api/.vercel/output/config.json');
    }
    const apiFallbackFunc = path.join(
      API_ROOT_OUTPUT_DIR,
      'functions',
      `${FALLBACK_FUNCTION_NAME}.func`,
    );
    if (!(await pathExists(apiFallbackFunc))) {
      throw new Error(
        `Missing ${FALLBACK_FUNCTION_NAME} Lambda at apps/api/.vercel/output/functions/${FALLBACK_FUNCTION_NAME}.func`,
      );
    }
    console.log('  verified Build Output API config in repo root and apps/api/.vercel/output');
  }
}

export async function assembleVercelOutput(): Promise<void> {
  console.log('\nAssembling NestJS serverless functions into .vercel/output…');
  for (const spec of API_FUNCTIONS) {
    await buildServerlessFunction(spec);
  }
  await removeObservabilityFunctionSymlinks();
  await patchOutputConfig();
  if (process.env.VERCEL === '1') {
    await publishBuildOutputForVercelRoot();
  }
  await verifyDeployOutput();
  console.log('Vercel output assembly complete.');
}
