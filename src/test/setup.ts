import { beforeEach, vi } from 'vitest';
import { MemoryStorage } from './memoryStorage';

/**
 * Node's built-in `localStorage` throws `TypeError: localStorage.setItem is not a function`
 * unless the process is launched with a special flag. We stub a minimal, Storage-compatible,
 * in-memory implementation so that code under test (storage.ts, secureStorage.ts,
 * localAuthProvider.ts) can use `localStorage` exactly as it would in a browser.
 */
const memoryStorage = new MemoryStorage();

vi.stubGlobal('localStorage', memoryStorage);

beforeEach(() => {
  // Tests that simulate other devices swap localStorage; start every test on the default one.
  vi.stubGlobal('localStorage', memoryStorage);
  memoryStorage.clear();
});
