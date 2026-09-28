import * as argon2 from 'argon2';
import * as crypto from 'crypto';

export interface PasswordVerificationResult {
  valid: boolean;
  needsRehash: boolean;
}

export class PasswordHasher {
  // Argon2id parameters (RFC 9106 recommended)
  // In test environment, memory cost is scaled down to 4MB for sub-second test execution
  private static readonly ARGON2_OPTIONS = {
    type: 2 as const,
    memoryCost: process.env.NODE_ENV === 'test' ? 4096 : 65536, // 4 MB in test, 64 MB in prod
    timeCost: process.env.NODE_ENV === 'test' ? 1 : 3,
    parallelism: process.env.NODE_ENV === 'test' ? 1 : 4,
    raw: false as const,
  };

  /**
   * Hashes a password using Argon2id.
   */
  static async hash(password: string): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }
    return argon2.hash(password, this.ARGON2_OPTIONS);
  }

  /**
   * Verifies a password against a stored hash.
   * Supports both Argon2id hashes and legacy unsalted SHA-256 hex hashes.
   * If a legacy SHA-256 hash matches, `needsRehash` is returned as true to signal
   * that the caller should transparently upgrade the hash to Argon2id.
   */
  static async verify(
    password: string,
    storedHash: string,
  ): Promise<PasswordVerificationResult> {
    if (!password || !storedHash) {
      return { valid: false, needsRehash: false };
    }

    // 1. Argon2id hash format: $argon2id$...
    if (storedHash.startsWith('$argon2id$')) {
      try {
        const valid = await argon2.verify(storedHash, password);
        return { valid, needsRehash: false };
      } catch {
        return { valid: false, needsRehash: false };
      }
    }

    // 2. Legacy SHA-256 64-character hex format
    if (/^[0-9a-f]{64}$/i.test(storedHash)) {
      const inputHash = crypto.createHash('sha256').update(password).digest('hex');
      try {
        const inputBuf = Buffer.from(inputHash, 'hex');
        const storedBuf = Buffer.from(storedHash, 'hex');
        if (inputBuf.length === storedBuf.length && crypto.timingSafeEqual(inputBuf, storedBuf)) {
          return { valid: true, needsRehash: true };
        }
      } catch {
        return { valid: false, needsRehash: false };
      }
      return { valid: false, needsRehash: false };
    }

    // 3. Unknown or malformed hash format
    return { valid: false, needsRehash: false };
  }
}
