import { ExternalLink } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";

const REPO_URL = "https://github.com/javidselimov/figma-bridge";
const INSTALL_COMMAND = "npx @ubuligan/figma-bridge plugin install";

export function HomeView() {
  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col justify-center gap-10 px-6 py-16">
      <title>figma-bridge — let Claude read your Figma file</title>

      <header className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">figma-bridge</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Let Claude read the Figma file you have open
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          A small Figma plugin and a local MCP server — locally, for free, read-only. No API token,
          no paid plan, and nothing leaves your machine.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
          <CardDescription>
            Install the plugin files, then import the manifest in Figma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* wraps instead of scrolling: a scrollable <pre> must be keyboard-focusable (axe) */}
          <pre className="rounded-md bg-muted p-4 text-sm break-all whitespace-pre-wrap">
            <code>{INSTALL_COMMAND}</code>
          </pre>
        </CardContent>
      </Card>

      <div>
        <Button asChild size="lg">
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            View on GitHub
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>
    </main>
  );
}
