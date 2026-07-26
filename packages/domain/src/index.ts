// Framework independent business rules for Ward Communications Hub.
//
// This package must never import Prisma, NestJS, Vue, or any provider SDK
// (email, SMS, Facebook, storage, queues, AI). Provider access is injected
// into domain services via adapters defined by the consuming app.
//
// See docs/domain-model.md for the entity relationship model these rules
// operate on.

export const DOMAIN_PACKAGE_NAME = '@ward-comms/domain';

export function describeDomainPackage(): string {
  return 'Ward Communications Hub domain rules (framework independent).';
}

export * from './enums.js';
export * from './age.js';
export * from './relationship-rules.js';
export * from './consent-rules.js';
export * from './contact-normalization.js';
