import { describe, expect, it } from "vitest";

import {
  createResettableStore,
  registerResettable,
  resetAllStores,
} from "./create-resettable-store";

type CounterState = { count: number; increment: () => void; reset: () => void };

const useCounterStore = createResettableStore<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}));

describe("createResettableStore", () => {
  it("resets every registered store", () => {
    useCounterStore.getState().increment();
    expect(useCounterStore.getState().count).toBe(1);

    resetAllStores();

    expect(useCounterStore.getState().count).toBe(0);
  });

  it("stops calling an unregistered resetter", () => {
    let calls = 0;
    const unregister = registerResettable(() => calls++);

    resetAllStores();
    unregister();
    resetAllStores();

    expect(calls).toBe(1);
  });
});
