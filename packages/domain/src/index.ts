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
export * from './auth/password-policy.js';
export * from './auth/lockout-policy.js';
export * from './auth/ward-code-policy.js';
export * from './auth/session-policy.js';
export * from './directory/minor-access-policy.js';
export * from './directory/contact-method-rules.js';
export * from './audiences/membership-mode.js';
export * from './audiences/rule-evaluation.js';
export * from './audiences/overlap.js';
export * from './audiences/safe-delete.js';
export * from './ai/image-generation-adapter.js';
export * from './campaigns/campaign-status.js';
export * from './campaigns/campaign-submission-validation.js';
export * from './campaigns/content-resolution.js';
export * from './campaigns/overlap-resolution.js';
export * from './campaigns/asset-confirmation.js';
export * from './delivery/idempotency.js';
export * from './delivery/recipient-expansion.js';
export * from './delivery/retry-policy.js';
export * from './delivery/batch-status.js';
export * from './delivery/provider-adapter.js';
export * from './delivery/queue-contract.js';
