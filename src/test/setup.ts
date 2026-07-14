import { beforeEach, vi } from 'vitest';

/**
 * Node's built-in `localStorage` throws `TypeError: localStorage.setItem is not a function`
 * unless the process is launched with a special flag. We stub a minimal, Storage-compatible,
 * in-memory implementation so that code under test (storage.ts, secureStorage.ts,
 * localAuthProvider.ts) can use `localStorage` exactly as it would in a browser.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const memoryStorage = new MemoryStorage();

vi.stubGlobal('localStorage', memoryStorage);

beforeEach(() => {
  memoryStorage.clear();
});
