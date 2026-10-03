import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Settings2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { explainMotionOptions } from "@/lib/motion-guide.functions";
import { useMotionPreference, type MotionLevel } from "@/lib/motion";

type Priority = "comfort" | "performance" | "cinema";

const LEVELS: Array<{ value: MotionLevel; label: string; note: string }> = [
  { value: "full", label: "Full", note: "Cinematic movement" },
  { value: "gentle", label: "Gentle", note: "Calmer and lighter" },
  { value: "reduced", label: "Reduced", note: "Nearly still" },
];

export function MotionSettings() {
  const { level, setLevel } = useMotionPreference();
  const explain = useServerFn(explainMotionOptions);
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState<Priority>("comfort");
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function getExplanation() {
    setBusy(true);
    setError("");
    try {
      const result = await explain({ data: { level, priority } });
      setExplanation(result.explanation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Motion guidance is unavailable right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 sm:bottom-6 sm:right-6">
      {open && (
        <section
          aria-label="Motion settings"
          className="panel motion-panel mb-3 w-[min(22rem,calc(100vw-2rem))] p-4 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold">Motion comfort</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Choose how lively the screens feel.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close motion settings"
              onClick={() => setOpen(false)}
              className="min-h-11 min-w-11"
            >
              <X />
            </Button>
          </div>

          <div
            className="mt-4 grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Animation intensity"
          >
            {LEVELS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                role="radio"
                aria-checked={level === option.value}
                onClick={() => {
                  setLevel(option.value);
                  setExplanation("");
                }}
                className="motion-choice h-auto min-h-16 flex-col whitespace-normal px-2 py-2 text-center data-[selected=true]:border-primary data-[selected=true]:bg-primary/10"
                data-selected={level === option.value}
              >
                <span className="font-display text-xs font-bold uppercase">{option.label}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {option.note}
                </span>
              </Button>
            ))}
          </div>

          <label className="mt-4 block text-xs font-semibold text-muted-foreground">
            I care most about
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
              className="field mt-1.5 min-h-11 text-sm text-foreground"
            >
              <option value="comfort">visual comfort</option>
              <option value="performance">battery and performance</option>
              <option value="cinema">the cinematic feeling</option>
            </select>
          </label>

          <Button
            type="button"
            variant="outline"
            onClick={getExplanation}
            disabled={busy}
            className="mt-3 min-h-11 w-full border-primary/50"
          >
            <Sparkles /> {busy ? "Writing your guide…" : "Explain my choice"}
          </Button>
          {explanation && (
            <p
              aria-live="polite"
              className="mt-3 border-l-2 border-l-primary pl-3 text-sm leading-relaxed text-foreground/85"
            >
              {explanation}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      )}
      <Button
        type="button"
        size="icon"
        aria-label="Open motion settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="motion-trigger h-12 w-12 rounded-full border border-primary/50 bg-card text-primary shadow-lg hover:bg-muted"
      >
        <Settings2 />
      </Button>
    </div>
  );
}
