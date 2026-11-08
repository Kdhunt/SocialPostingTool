import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { RequirePermission } from '../decorators/require-permission.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';

@RequirePermission('platform.wards.manage')
class ClassLevelController {
  list(): void {}

  @RequirePermission('directory.read')
  overridden(): void {}
}

class MethodLevelController {
  @RequirePermission(['campaigns.create', 'campaigns.approve'])
  view(): void {}

  open(): void {}
}

function contextFor(
  controller: new () => object,
  method: string,
  permissions: string[],
): ExecutionContext {
  const handler = (controller.prototype as Record<string, () => void>)[method];
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ authContext: { user: { permissions } } }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('enforces a permission declared on the controller class', () => {
    expect(() =>
      guard.canActivate(contextFor(ClassLevelController, 'list', ['directory.read'])),
    ).toThrow(ForbiddenException);
    expect(
      guard.canActivate(contextFor(ClassLevelController, 'list', ['platform.wards.manage'])),
    ).toBe(true);
  });

  it('lets a method-level permission override the class-level one', () => {
    expect(
      guard.canActivate(contextFor(ClassLevelController, 'overridden', ['directory.read'])),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(ClassLevelController, 'overridden', ['platform.wards.manage'])),
    ).toThrow(ForbiddenException);
  });

  it('accepts any one of several method-level permissions', () => {
    expect(
      guard.canActivate(contextFor(MethodLevelController, 'view', ['campaigns.approve'])),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor(MethodLevelController, 'view', ['directory.read'])),
    ).toThrow(ForbiddenException);
  });

  it('allows a route with no permission requirement', () => {
    expect(guard.canActivate(contextFor(MethodLevelController, 'open', []))).toBe(true);
  });
});
