import { useSessionStore } from "@/entities/session";
import { tokenStorage } from "@/shared/api/token";

import { router } from "./router";

// Runs once before the router renders: both logout paths (button, failed refresh) end here.
tokenStorage.setLogoutHandler(() => {
  // session logout = token null + session reset + resetAllStores() + queryClient.clear()
  useSessionStore.getState().logout();
  void router.navigate({ to: "/" }); // TODO: "/login" once the login route exists
});
