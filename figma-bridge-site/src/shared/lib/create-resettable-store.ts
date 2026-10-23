import { create, type StateCreator, type StoreMutatorIdentifier } from "zustand";

type Resettable = { reset: () => void };

const resetters = new Set<() => void>();

/** Calls reset() on every registered store. Used only by logout (and test cleanup). */
export function resetAllStores(): void {
  resetters.forEach((reset) => reset());
}

/** For stores created elsewhere. Returns an unregister function. */
export function registerResettable(reset: () => void): () => void {
  resetters.add(reset);
  return () => resetters.delete(reset);
}

// Mos keeps middleware typing (e.g. persist → useStore.persist.*)
export function createResettableStore<
  T extends Resettable,
  Mos extends [StoreMutatorIdentifier, unknown][] = [],
>(initializer: StateCreator<T, [], Mos>) {
  const useStore = create<T>()(initializer);
  registerResettable(() => useStore.getState().reset());
  return useStore;
}
