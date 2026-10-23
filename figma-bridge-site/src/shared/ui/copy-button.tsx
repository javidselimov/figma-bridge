import { CheckIcon, CopyIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";

export type CopyButtonProps = { value: string; label?: string; className?: string };

const RESET_MS = 2000;

/** Icon button that copies `value` to the clipboard and briefly shows a check mark. */
export function CopyButton({ value, label = "Copy to clipboard", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | undefined>(undefined);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually.");
      return;
    }
    setCopied(true);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), RESET_MS);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : label}
      className={cn("text-muted-foreground hover:text-primary", className)}
      onClick={() => void handleCopy()}
    >
      {copied ? (
        <CheckIcon aria-hidden="true" className="text-primary" />
      ) : (
        <CopyIcon aria-hidden="true" />
      )}
    </Button>
  );
}
