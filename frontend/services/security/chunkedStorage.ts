/**
 * Key/value storage that splits large values into chunks (the iOS Keychain / Android Keystore backed
 * expo-secure-store warns above ~2 KB, and a Supabase session is larger). Pure logic: the backends are
 * injected, so it is unit-tested without React Native.
 *
 * Migration: when a key is missing in the secure backend but exists in the legacy one (AsyncStorage,
 * where earlier versions kept the session), the value is copied once into the secure backend and then
 * deleted from the legacy one — users stay signed in, and the plaintext copy disappears.
 */
export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const CHUNK_SIZE = 1800;
const META = 'chunks:';

/** expo-secure-store accepts only [A-Za-z0-9._-] in keys. */
export const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');
const chunkKey = (key: string, index: number) => `${safeKey(key)}.c${index}`;

export function splitIntoChunks(value: string, size = CHUNK_SIZE): string[] {
  if (value.length === 0) return [''];
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += size) parts.push(value.slice(i, i + size));
  return parts;
}

export function createChunkedStorage(secure: KeyValueBackend, legacy?: KeyValueBackend): KeyValueBackend {
  async function count(key: string): Promise<number | null> {
    const meta = await secure.getItem(safeKey(key));
    if (!meta || !meta.startsWith(META)) return null;
    const n = Number(meta.slice(META.length));
    return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null;
  }

  async function removeChunks(key: string, from: number, to: number) {
    for (let i = from; i < to; i++) await secure.removeItem(chunkKey(key, i));
  }

  async function write(key: string, value: string) {
    const previous = (await count(key)) ?? 0;
    const parts = splitIntoChunks(value);
    for (let i = 0; i < parts.length; i++) await secure.setItem(chunkKey(key, i), parts[i]);
    await secure.setItem(safeKey(key), `${META}${parts.length}`);
    await removeChunks(key, parts.length, previous);
  }

  return {
    async getItem(key) {
      const n = await count(key);
      if (n !== null) {
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const part = await secure.getItem(chunkKey(key, i));
          if (part === null) return null; // incomplete write → treat as signed out, never as a partial token
          parts.push(part);
        }
        return parts.join('');
      }
      if (!legacy) return null;
      const old = await legacy.getItem(key);
      if (old === null) return null;
      await write(key, old);
      await legacy.removeItem(key);
      return old;
    },
    setItem: write,
    async removeItem(key) {
      const n = (await count(key)) ?? 0;
      await removeChunks(key, 0, n);
      await secure.removeItem(safeKey(key));
      if (legacy) await legacy.removeItem(key);
    },
  };
}
