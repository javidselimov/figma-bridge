import { ExternalLink } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { CopyButton } from "@/shared/ui/copy-button";
import { GradientCard } from "@/shared/ui/gradient-card";

const REPO_URL = "https://github.com/javidselimov/figma-bridge";
const NPM_URL = "https://www.npmjs.com/package/@ubuligan/figma-bridge";
const REACTIVITE_URL = "https://reactivite.vercel.app/";
const INSTALL_COMMAND = "npx @ubuligan/figma-bridge plugin install";

export function HomeView() {
  return (
    <main className="mx-auto flex h-svh max-w-3xl flex-col justify-center overflow-y-auto px-4 py-4 sm:px-6">
      <title>figma-bridge — let Claude read your Figma file</title>

      <GradientCard className="flex flex-col gap-6 p-5 sm:gap-8 sm:p-8">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            <a
              href={REACTIVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 hover:text-primary"
            >
              <span aria-hidden="true" className="text-primary">
                ▲
              </span>
              <span className="text-base font-bold tracking-tight text-foreground">reactivite</span>
            </a>
            <span className="text-muted-foreground">/ figma-bridge</span>
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Let Claude read the Figma file you have open
          </h1>
          <p className="max-w-prose text-base text-muted-foreground sm:text-lg">
            A small Figma plugin and a local MCP server — locally, for free, read-only. No API
            token, no paid plan, and nothing leaves your machine.
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
            <div className="flex items-center gap-2 rounded-md bg-muted py-2 pr-2 pl-4">
              <pre className="flex-1 py-2 text-sm break-all whitespace-pre-wrap">
                <code>{INSTALL_COMMAND}</code>
              </pre>
              <CopyButton value={INSTALL_COMMAND} label="Copy install command" />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              View on GitHub
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              View on npm
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-primary/15 pt-4 text-sm">
          <p className="text-muted-foreground">
            A <span className="font-medium text-primary">reactivite</span> product · by{" "}
            <span className="font-medium text-foreground">Javid Salimov</span>
          </p>
          <a
            href={REACTIVITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
          >
            More skills and plugins
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </footer>
      </GradientCard>
    </main>
  );
}
