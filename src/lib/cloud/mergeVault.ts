import type { VaultData } from '../vault';

/**
 * Three-way merge of two vaults edited at the same time on two devices (docs §4).
 *
 * `base` is the last state both devices got from the cloud; without it there is no way
 * to tell "the other device created this" from "this device deleted it", and the caller
 * must fall back to the manual choice.
 *
 * Rules, with equality by stable JSON:
 * - not in the base and only one side has it: it enters;
 * - not in the base, both have it and they differ: the local one stays;
 * - deleted on one side, untouched on the other: it is deleted;
 * - deleted on one side, edited on the other: the edit stays;
 * - edited on both sides: the local one stays.
 *
 * `invoices` only merge the `paid` flag: every other field is derived from the purchases.
 */

/** Merged record by record, by id. */
const ID_COLLECTIONS = ['transactions', 'cards', 'card_purchases', 'rules'] as const;
const INVOICES = 'invoices';

type VaultRecord = Record<string, unknown> & { id: string };

export interface MergeResult {
  data: VaultData;
  /** Times both devices changed the same thing in different ways. */
  conflicts: number;
}

/** Same content, same string, whatever the key order is. */
function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(key => [key, sortDeep((value as Record<string, unknown>)[key])] as const);
    return Object.fromEntries(entries);
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  return stableJson(a) === stableJson(b);
}

/**
 * The collection indexed by id, or null when it is not a list of records with unique
 * string ids: merging that is guesswork, so the caller asks the user instead.
 * A missing collection counts as an empty list, as the app writes it.
 */
function indexById(value: unknown): Map<string, VaultRecord> | null {
  const byId = new Map<string, VaultRecord>();
  if (value === undefined || value === null) return byId;
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const id = (item as VaultRecord).id;
    if (typeof id !== 'string' || id === '') return null;
    if (byId.has(id)) return null;
    byId.set(id, item as VaultRecord);
  }
  return byId;
}

/** Local order first, then the ids only the other device has, in its own order. */
function mergedOrder(local: Map<string, VaultRecord>, remote: Map<string, VaultRecord>): string[] {
  const ids = [...local.keys()];
  for (const id of remote.keys()) if (!local.has(id)) ids.push(id);
  return ids;
}

interface Decision {
  /** undefined means the record is not in the result. */
  value: VaultRecord | undefined;
  conflict: boolean;
}

function decideRecord(
  base: VaultRecord | undefined,
  local: VaultRecord | undefined,
  remote: VaultRecord | undefined,
): Decision {
  if (local === undefined && remote === undefined) return { value: undefined, conflict: false };

  if (base === undefined) {
    // New on at least one side: nothing was deleted, because there was nothing to delete.
    if (local === undefined) return { value: remote, conflict: false };
    if (remote === undefined) return { value: local, conflict: false };
    return { value: local, conflict: !same(local, remote) };
  }

  const localChanged = !same(local, base);
  const remoteChanged = !same(remote, base);
  if (!localChanged && !remoteChanged) return { value: local, conflict: false };
  if (localChanged && !remoteChanged) return { value: local, conflict: false };
  if (!localChanged && remoteChanged) return { value: remote, conflict: false };

  // Both changed: same change is not a conflict; a delete never beats an edit.
  if (same(local, remote)) return { value: local, conflict: false };
  if (local === undefined) return { value: remote, conflict: true };
  return { value: local, conflict: true };
}

/** Same existence rules, but the only field compared and merged is `paid`. */
function decideInvoice(
  base: VaultRecord | undefined,
  local: VaultRecord | undefined,
  remote: VaultRecord | undefined,
): Decision {
  if (local === undefined && remote === undefined) return { value: undefined, conflict: false };

  if (local !== undefined && remote !== undefined) {
    if (base === undefined) {
      return { value: local, conflict: !same(local.paid, remote.paid) };
    }
    const localChanged = !same(local.paid, base.paid);
    const remoteChanged = !same(remote.paid, base.paid);
    if (localChanged && remoteChanged && !same(local.paid, remote.paid)) {
      return { value: local, conflict: true };
    }
    const paid = localChanged ? local.paid : remote.paid;
    return { value: { ...local, paid }, conflict: false };
  }

  const kept = local ?? remote!;
  if (base === undefined) return { value: kept, conflict: false }; // added on one side only
  // Deleted on one side: the other side keeps it only if it changed `paid`.
  return same(kept.paid, base.paid) ? { value: undefined, conflict: false } : { value: kept, conflict: true };
}

function mergeCollection(
  baseValue: unknown,
  localValue: unknown,
  remoteValue: unknown,
  decide: (b: VaultRecord | undefined, l: VaultRecord | undefined, r: VaultRecord | undefined) => Decision,
): { records: VaultRecord[]; conflicts: number } | null {
  const base = indexById(baseValue);
  const local = indexById(localValue);
  const remote = indexById(remoteValue);
  if (!base || !local || !remote) return null;

  const records: VaultRecord[] = [];
  let conflicts = 0;
  for (const id of mergedOrder(local, remote)) {
    const decision = decide(base.get(id), local.get(id), remote.get(id));
    if (decision.conflict) conflicts += 1;
    if (decision.value !== undefined) records.push(decision.value);
  }
  return { records, conflicts };
}

/**
 * The merged vault, or null when the data does not allow a safe automatic merge
 * (a collection that is not a list of records with unique ids).
 */
export function mergeVaults(base: VaultData, local: VaultData, remote: VaultData): MergeResult | null {
  const data: VaultData = {};
  let conflicts = 0;

  for (const key of ID_COLLECTIONS) {
    const merged = mergeCollection(base[key], local[key], remote[key], decideRecord);
    if (!merged) return null;
    data[key] = merged.records;
    conflicts += merged.conflicts;
  }

  const invoices = mergeCollection(base[INVOICES], local[INVOICES], remote[INVOICES], decideInvoice);
  if (!invoices) return null;
  data[INVOICES] = invoices.records;
  conflicts += invoices.conflicts;

  // Anything else the vault may carry (now or in a future version) merges as one value.
  const handled = new Set<string>([...ID_COLLECTIONS, INVOICES]);
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    if (handled.has(key)) continue;
    const localChanged = !same(local[key], base[key]);
    const remoteChanged = !same(remote[key], base[key]);
    const value = localChanged || !remoteChanged ? local[key] : remote[key];
    if (localChanged && remoteChanged && !same(local[key], remote[key])) conflicts += 1;
    if (value !== undefined) data[key] = value;
  }

  return { data, conflicts };
}

/** Notice shown after an automatic merge. */
export function mergeNotice(conflicts: number): string {
  return `Juntamos alterações de outro aparelho (${conflicts} ${
    conflicts === 1 ? 'conflito' : 'conflitos'
  }; mantivemos as deste aparelho).`;
}
