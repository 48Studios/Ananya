import * as crypto from 'crypto';
import { PasswordHasher } from './password-hasher';

describe('PasswordHasher', () => {
  const plainPassword = 'MySecurePassword123!';

  it('hashes password producing an argon2id formatted string', async () => {
    const hash = await PasswordHasher.hash(plainPassword);
    expect(hash).toBeDefined();
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies correctly with argon2id hash', async () => {
    const hash = await PasswordHasher.hash(plainPassword);
    const result = await PasswordHasher.verify(plainPassword, hash);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(false);
  });

  it('rejects incorrect password with argon2id hash', async () => {
    const hash = await PasswordHasher.hash(plainPassword);
    const result = await PasswordHasher.verify('WrongPassword999!', hash);
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it('verifies legacy SHA-256 hash and signals needsRehash=true', async () => {
    const legacySha256 = crypto
      .createHash('sha256')
      .update(plainPassword)
      .digest('hex');

    expect(legacySha256).toHaveLength(64);

    const result = await PasswordHasher.verify(plainPassword, legacySha256);
    expect(result.valid).toBe(true);
    expect(result.needsRehash).toBe(true);
  });

  it('rejects incorrect password with legacy SHA-256 hash', async () => {
    const legacySha256 = crypto
      .createHash('sha256')
      .update(plainPassword)
      .digest('hex');

    const result = await PasswordHasher.verify('WrongPassword999!', legacySha256);
    expect(result.valid).toBe(false);
    expect(result.needsRehash).toBe(false);
  });

  it('fails safely on malformed or empty inputs', async () => {
    expect(await PasswordHasher.verify('', 'somehash')).toEqual({
      valid: false,
      needsRehash: false,
    });
    expect(await PasswordHasher.verify(plainPassword, '')).toEqual({
      valid: false,
      needsRehash: false,
    });
    expect(await PasswordHasher.verify(plainPassword, 'not-a-valid-hash')).toEqual({
      valid: false,
      needsRehash: false,
    });
  });
});
