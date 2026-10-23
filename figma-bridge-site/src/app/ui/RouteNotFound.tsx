import { Link } from "@tanstack/react-router";

import { Button } from "@/shared/ui/button";

export function RouteNotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <Button asChild>
        <Link to="/">Back to home</Link>
      </Button>
    </main>
  );
}
