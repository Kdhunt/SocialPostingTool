/**
 * Prints every HTTP route the API registers, with the guards and permission
 * it declares, as JSON. Reads Nest decorator metadata straight from the
 * module tree, so nothing is started and no database is needed.
 *
 * Used by the local end-to-end suite to prove that every route has an
 * authorization expectation (apps/web-e2e/tests/local/api-authorization.spec.ts).
 */
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { REQUIRE_PERMISSION_KEY } from '../src/auth/decorators/require-permission.decorator.js';

export interface ApiRoute {
  method: string;
  path: string;
  controller: string;
  handler: string;
  guards: string[];
  permissions: string[];
}

type Constructor = abstract new (...args: never[]) => unknown;

function isConstructor(value: unknown): value is Constructor {
  return typeof value === 'function';
}

function moduleClass(entry: unknown): Constructor | undefined {
  if (isConstructor(entry)) return entry;
  if (entry && typeof entry === 'object' && 'module' in entry) {
    const inner = (entry as { module: unknown }).module;
    return isConstructor(inner) ? inner : undefined;
  }
  return undefined;
}

function collectControllers(root: Constructor): Constructor[] {
  const seen = new Set<Constructor>();
  const controllers = new Set<Constructor>();
  const visit = (module: Constructor): void => {
    if (seen.has(module)) return;
    seen.add(module);
    for (const controller of (Reflect.getMetadata('controllers', module) ?? []) as unknown[]) {
      if (isConstructor(controller)) controllers.add(controller);
    }
    for (const imported of (Reflect.getMetadata('imports', module) ?? []) as unknown[]) {
      const next = moduleClass(imported);
      if (next) visit(next);
    }
  };
  visit(root);
  return [...controllers];
}

function guardNames(target: object): string[] {
  return ((Reflect.getMetadata('__guards__', target) ?? []) as Array<{ name?: string }>).map(
    (guard) => guard.name ?? 'anonymous',
  );
}

function joinPath(...parts: string[]): string {
  const joined = parts
    .flatMap((part) => part.split('/'))
    .filter((segment) => segment.length > 0)
    .join('/');
  return `/${joined}`;
}

export function listApiRoutes(): ApiRoute[] {
  const routes: ApiRoute[] = [];
  for (const controller of collectControllers(AppModule)) {
    const basePaths = [Reflect.getMetadata('path', controller) ?? ''].flat() as string[];
    const prototype = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler = prototype[name];
      if (name === 'constructor' || typeof handler !== 'function') continue;
      const method = Reflect.getMetadata('method', handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      const handlerPaths = [Reflect.getMetadata('path', handler) ?? ''].flat() as string[];
      const permissions = (Reflect.getMetadata(REQUIRE_PERMISSION_KEY, handler) ??
        Reflect.getMetadata(REQUIRE_PERMISSION_KEY, controller) ??
        []) as string[];
      for (const basePath of basePaths) {
        for (const handlerPath of handlerPaths) {
          routes.push({
            method: RequestMethod[method],
            path: joinPath(basePath, handlerPath),
            controller: controller.name,
            handler: name,
            guards: [...guardNames(controller), ...guardNames(handler)],
            permissions,
          });
        }
      }
    }
  }
  return routes.sort((a, b) => `${a.path} ${a.method}`.localeCompare(`${b.path} ${b.method}`));
}

process.stdout.write(`${JSON.stringify(listApiRoutes(), null, 2)}\n`);
