import { createCipheriv, randomBytes } from 'node:crypto';

export function decodeCccdKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error('CCCD_KEY phải là base64 của 32 byte');
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('CCCD_KEY phải là base64 của 32 byte');
  }
  return key;
}

// CON-04: each value gets an independent random IV; only opaque ciphertext is persisted.
export function encryptCccd(number: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = decodeCccdKey(env.CCCD_KEY);
  if (typeof number !== 'string' || !/^[0-9]{4,}$/.test(number)) throw new RangeError('CCCD number must contain digits');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(number, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${ciphertext.toString('base64')}:${cipher.getAuthTag().toString('base64')}`;
}

export function last4(number: string): string {
  if (typeof number !== 'string' || !/^[0-9]{4,}$/.test(number)) throw new RangeError('CCCD number must contain digits');
  return number.slice(-4);
}
