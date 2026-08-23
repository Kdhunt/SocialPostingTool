import { describe, expect, it } from 'vitest';
import { PasswordHasherService } from './password-hasher.service.js';

describe('PasswordHasherService', () => {
  it('hashes a password as an Argon2id hash and verifies it correctly', async () => {
    const hasher = new PasswordHasherService();
    const hash = await hasher.hash('Fictional-Password-42');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, 'Fictional-Password-42')).toBe(true);
    expect(await hasher.verify(hash, 'wrong-password')).toBe(false);
  });

  it('never throws on a malformed hash — verify fails closed', async () => {
    const hasher = new PasswordHasherService();
    expect(await hasher.verify('not-a-real-hash', 'anything')).toBe(false);
  });
});
