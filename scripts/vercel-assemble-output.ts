import { cp, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nodeFileTrace } from '@vercel/nft';
import esbuild from 'esbuild';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, '.vercel/output');
const CONFIG_PATH = path.join(OUTPUT_DIR, 'config.json');

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

/** API routes must be registered before Nuxt page routes in config.json. */
const API_ROUTES = [
  { src: '/api/v1/(.*)', dest: '/api/nest' },
  { src: '/api/cron/process-schedules', dest: '/api/cron/process-schedules' },
  { src: '/api/cron/process-delivery-queue', dest: '/api/cron/process-delivery-queue' },
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

async function buildServerlessFunction(spec: FunctionSpec): Promise<void> {
  const entryPath = path.join(ROOT, spec.entry);
  const funcDir = path.join(OUTPUT_DIR, 'functions', `${spec.name}.func`);
  const handlerPath = path.join(funcDir, 'index.mjs');

  await mkdir(funcDir, { recursive: true });

  await esbuild.build({
    entryPoints: [entryPath],
    outfile: handlerPath,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    packages: 'external',
    sourcemap: true,
    logLevel: 'warning',
  });

  const { fileList } = await nodeFileTrace([handlerPath], { base: ROOT });
  await copyTracedFiles(ROOT, fileList, funcDir);

  await writeFile(
    path.join(funcDir, '.vc-config.json'),
    JSON.stringify(
      {
        runtime: 'nodejs20.x',
        handler: 'index.mjs',
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

async function patchOutputConfig(): Promise<void> {
  const raw = await readFile(CONFIG_PATH, 'utf8');
  const config = JSON.parse(raw) as { version: number; routes: Array<Record<string, string>> };

  const fallbackIndex = config.routes.findIndex(
    (route) => route.src === '/(.*)' && route.dest === '/__fallback',
  );
  const insertAt = fallbackIndex === -1 ? config.routes.length : fallbackIndex;

  config.routes.splice(insertAt, 0, ...API_ROUTES);
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`  patched config.json (${API_ROUTES.length} API routes)`);
}

export async function assembleVercelOutput(): Promise<void> {
  console.log('\nAssembling NestJS serverless functions into .vercel/output…');
  for (const spec of API_FUNCTIONS) {
    await buildServerlessFunction(spec);
  }
  await patchOutputConfig();
  console.log('Vercel output assembly complete.');
}
