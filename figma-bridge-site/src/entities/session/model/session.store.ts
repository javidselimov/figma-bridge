import { create } from "zustand";

import { queryClient } from "@/shared/api/query-client";
import { tokenStorage } from "@/shared/api/token";
import { resetAllStores } from "@/shared/lib/create-resettable-store";

export type SessionUser = { id: string; name: string }; // TODO: real fields

export type SessionStatus = "unknown" | "authenticated" | "anonymous";

type SessionState = {
  user: SessionUser | null;
  status: SessionStatus;
  setUser: (user: SessionUser) => void;
  logout: () => void;
};

// Root store: mirrors auth state for the UI — the access token itself stays in shared/api/token.ts.
export const useSessionStore = create<SessionState>()((set) => ({
  user: null,
  status: "unknown",
  setUser: (user) => set({ user, status: "authenticated" }),
  logout: () => {
    tokenStorage.set(null); // 1. in-memory access token gone
    set({ user: null, status: "anonymous" }); // 2. root store
    resetAllStores(); // 3. every feature store (+ persisted keys)
    queryClient.clear(); // 4. all cached server data
    // 5. redirect — the handler registered via tokenStorage.setLogoutHandler (app/init-auth.ts)
  },
}));
