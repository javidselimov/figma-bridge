import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { Button } from "@/shared/ui/button";

export type RouteErrorProps = ErrorComponentProps;

// Generic message only — never render error.message to users.
export function RouteError({ reset }: RouteErrorProps) {
  const router = useRouter();

  const retry = () => {
    reset();
    void router.invalidate();
  };

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Please try again. If it keeps happening, reload the page.
      </p>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
