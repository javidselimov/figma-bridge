import { describe, expect, it } from "vitest";

import { queryClient } from "@/shared/api/query-client";
import { tokenStorage } from "@/shared/api/token";
import { createResettableStore } from "@/shared/lib/create-resettable-store";

import { useSessionStore } from "./session.store";

type FlagState = { on: boolean; toggle: () => void; reset: () => void };

const useFlagStore = createResettableStore<FlagState>((set) => ({
  on: false,
  toggle: () => set((s) => ({ on: !s.on })),
  reset: () => set({ on: false }),
}));

describe("session store", () => {
  it("marks the user authenticated", () => {
    useSessionStore.getState().setUser({ id: "1", name: "Ada" });

    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("logout clears token, session, feature stores and the query cache", () => {
    tokenStorage.set("abc");
    useSessionStore.getState().setUser({ id: "1", name: "Ada" });
    useFlagStore.getState().toggle();
    queryClient.setQueryData(["probe"], 1);

    useSessionStore.getState().logout();

    expect(tokenStorage.get()).toBeNull();
    expect(useSessionStore.getState()).toMatchObject({ user: null, status: "anonymous" });
    expect(useFlagStore.getState().on).toBe(false);
    expect(queryClient.getQueryData(["probe"])).toBeUndefined();
  });
});
