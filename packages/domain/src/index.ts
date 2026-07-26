// Framework independent business rules for Ward Communications Hub.
//
// This package must never import Prisma, NestJS, Vue, or any provider SDK
// (email, SMS, Facebook, storage, queues, AI). Provider access is injected
// into domain services via adapters defined by the consuming app.
//
// Domain entities (ward members, households, audience groups, campaigns,
// deliveries) are introduced in Phase 3 onward. This Phase 2 scaffold only
// establishes the package boundary and a trivial exported value so other
// packages/apps can depend on it and be wired up end to end.

export const DOMAIN_PACKAGE_NAME = '@ward-comms/domain';

export function describeDomainPackage(): string {
  return 'Ward Communications Hub domain rules (framework independent).';
}
