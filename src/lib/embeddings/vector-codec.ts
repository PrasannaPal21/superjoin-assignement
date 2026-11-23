/**
 * Encode/decode float vectors for SQLite BLOB storage (little-endian Float32).
 */

export function encodeVector(vector: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i], i * 4);
  }
  return buf;
}

export function decodeVector(blob: Buffer | Uint8Array): number[] {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (buf.length % 4 !== 0) {
    throw new Error(`Invalid embedding blob length: ${buf.length}`);
  }
  const n = buf.length / 4;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = buf.readFloatLE(i * 4);
  }
  return out;
}
