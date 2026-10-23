import { createRouter } from "@tanstack/react-router";

import { queryClient } from "@/shared/api/query-client";
import { logger } from "@/shared/lib/logger";

import { routeTree } from "../routeTree.gen";
import { RouteError } from "./ui/RouteError";
import { RouteNotFound } from "./ui/RouteNotFound";

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0, // let Query own freshness
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: RouteNotFound,
  defaultOnCatch: (error) => logger.error(error), // report without a useEffect
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
