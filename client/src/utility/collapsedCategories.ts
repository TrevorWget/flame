import { useCallback, useSyncExternalStore } from 'react';

// Ids of the categories collapsed on the homepage. Kept per browser rather
// than in the database so it also works for guests.
export const COLLAPSED_CATEGORIES_KEY = 'collapsedCategories';

type Ids = ReadonlySet<number>;

const listeners = new Set<() => void>();

let storedRaw: string | null = null;
let collapsedIds: Ids = new Set();
// Falls back to keeping the state in memory when storage is blocked or full
let storageWorks = true;

const parse = (raw: string | null): Ids => {
  if (!raw) return new Set();

  try {
    const value: unknown = JSON.parse(raw);

    return new Set(
      Array.isArray(value)
        ? value.filter((id): id is number => Number.isInteger(id) && id > 0)
        : []
    );
  } catch {
    return new Set();
  }
};

const getSnapshot = (): Ids => {
  if (!storageWorks) return collapsedIds;

  try {
    const raw = localStorage.getItem(COLLAPSED_CATEGORIES_KEY);

    if (raw !== storedRaw) {
      storedRaw = raw;
      collapsedIds = parse(raw);
    }
  } catch {
    storageWorks = false;
  }

  return collapsedIds;
};

const notify = () => listeners.forEach((listener) => listener());

const onStorage = (e: StorageEvent) => {
  if (e.key === null || e.key === COLLAPSED_CATEGORIES_KEY) notify();
};

const subscribe = (listener: () => void) => {
  if (!listeners.size) window.addEventListener('storage', onStorage);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener('storage', onStorage);
  };
};

const save = (ids: Ids) => {
  collapsedIds = ids;

  if (storageWorks) {
    try {
      if (ids.size) {
        storedRaw = JSON.stringify([...ids].sort((a, b) => a - b));
        localStorage.setItem(COLLAPSED_CATEGORIES_KEY, storedRaw);
      } else {
        storedRaw = null;
        localStorage.removeItem(COLLAPSED_CATEGORIES_KEY);
      }
    } catch {
      storageWorks = false;
    }
  }

  notify();
};

export const toggleCollapsedCategory = (id: number): void => {
  const ids = new Set(getSnapshot());

  if (!ids.delete(id)) ids.add(id);
  save(ids);
};

// Forgets deleted categories. Only call it with every existing category id,
// which guests don't get.
export const pruneCollapsedCategories = (existingIds: number[]): void => {
  const current = getSnapshot();
  const existing = new Set(existingIds);
  const ids = new Set([...current].filter((id) => existing.has(id)));

  if (ids.size !== current.size) save(ids);
};

export const useCollapsedCategory = (id: number): [boolean, () => void] => {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot).has(id);
  const toggle = useCallback(() => toggleCollapsedCategory(id), [id]);

  return [collapsed, toggle];
};
