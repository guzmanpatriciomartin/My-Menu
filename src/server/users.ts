import crypto from 'crypto';
import { UserRole } from '../types';

export interface ServerUser {
  id: string;
  email: string;
  passwordHash: string; // format "salt:hash" (scrypt, 64-byte derived key)
  role: UserRole;
  establishmentId: string;
}

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

// Hash a plaintext password using scrypt. Zero external deps.
// Output format: "<saltHex>:<hashHex>".
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

// Constant-time verification of a plaintext password against a stored "salt:hash".
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;

  const storedBuf = Buffer.from(hashHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);

  // Lengths must match before timingSafeEqual, otherwise it throws.
  if (storedBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(storedBuf, derivedBuf);
}

// Seed users. Password hashes were generated once with hashPassword() and pasted
// here so the raw passwords never live in source.
//   carolina@mimenu.com -> 'admin'  (admin,  bodegon-palermo)
//   tomas@mimenu.com    -> 'mesero' (waiter, bodegon-palermo)
//   martin@mimenu.com   -> 'admin'  (admin,  cafe-speakeasy)
//   sofia@mimenu.com    -> 'mesero' (waiter, cafe-speakeasy)
export const seedUsers: ServerUser[] = [
  {
    id: 'usr-1',
    email: 'carolina@mimenu.com',
    passwordHash:
      '4513d11b862f284593b0250c57386e60:ab5b8fdd83d805e7679197708b96048c94c5d850d90a37220a220ab2b25c1c6e48c87d67238faa1fc31e2e1ff44fbdc5d504d7fd1643b451a8367502507e997a',
    role: 'admin',
    establishmentId: 'bodegon-palermo',
  },
  {
    id: 'usr-2',
    email: 'tomas@mimenu.com',
    passwordHash:
      '83e1b4aabf59f9257586711274495848:d98c914480c71806325368587d291a9a7d97140d6a3b0b0272fc0d47a16af1db4be411dd5576f4c727b8a67d4e29660ba4a4f8e82e2ceba9e05d2f3a665f5626',
    role: 'waiter',
    establishmentId: 'bodegon-palermo',
  },
  {
    id: 'usr-3',
    email: 'martin@mimenu.com',
    passwordHash:
      '11ce4423b7f48a295fb2674e98eac0bf:5f7760391a8e129b1cbe39c31acef742173345aa245c1133447a1250a88c824ecd737cb366b24e8669048b06ba8f22fda971eeb3a07ba86ff21b320437b6fd9a',
    role: 'admin',
    establishmentId: 'cafe-speakeasy',
  },
  {
    id: 'usr-4',
    email: 'sofia@mimenu.com',
    passwordHash:
      '83e1b4aabf59f9257586711274495848:d98c914480c71806325368587d291a9a7d97140d6a3b0b0272fc0d47a16af1db4be411dd5576f4c727b8a67d4e29660ba4a4f8e82e2ceba9e05d2f3a665f5626',
    role: 'waiter',
    establishmentId: 'cafe-speakeasy',
  },
];

// Case-insensitive lookup by email.
export function findUserByEmail(email: string): ServerUser | undefined {
  const normalized = email.trim().toLowerCase();
  return seedUsers.find((u) => u.email.toLowerCase() === normalized);
}
