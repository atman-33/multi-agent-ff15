import { Check, Loader2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Mode {
  description: string;
  name: string;
}

export default function ModeSwitcher() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [activeMode, setActiveMode] = useState<string>("custom");
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchModes = useCallback(async () => {
    try {
      const res = await fetch("/api/modes");
      if (!res.ok) {
        throw new Error("Failed to fetch modes");
      }
      const data = (await res.json()) as {
        activeMode?: string;
        modes?: Mode[];
      };
      setModes(data.modes || []);
      setActiveMode(data.activeMode || "custom");
    } catch (e) {
      console.error(e);
      setActiveMode("custom");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchModes();

    const handleModeRefresh = () => {
      void fetchModes();
    };

    window.addEventListener("mode-switched", handleModeRefresh);
    window.addEventListener("agent-model-switched", handleModeRefresh);

    return () => {
      window.removeEventListener("mode-switched", handleModeRefresh);
      window.removeEventListener("agent-model-switched", handleModeRefresh);
    };
  }, [fetchModes]);

  const handleSwitch = async (modeName: string) => {
    if (modeName === activeMode || isSwitching) {
      return;
    }

    setIsSwitching(true);
    setIsOpen(false);
    const prevMode = activeMode;
    setActiveMode(modeName);

    try {
      const res = await fetch("/api/mode-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: modeName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to switch mode");
      }

      toast.success(`Successfully switched to ${modeName} mode`);
      window.dispatchEvent(new CustomEvent("mode-switched"));
    } catch (e) {
      toast.error(`Mode switch failed: ${String(e)}`);
      setActiveMode(prevMode);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "h-6 gap-1.5 px-2 text-[10px] transition-all duration-200",
            isSwitching
              ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
              : "border-border/40 hover:bg-white/5"
          )}
          disabled={isLoading}
          size="sm"
          variant="outline"
        >
          {isSwitching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Zap
              className={cn(
                "h-3 w-3",
                activeMode !== "normal" && "fill-amber-400/20 text-amber-400"
              )}
            />
          )}
          <span className="font-medium opacity-90">Mode:</span>
          <span className="font-bold capitalize">{activeMode}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 border-zinc-800 bg-zinc-900 p-2 shadow-xl"
      >
        <div className="px-2 py-1.5">
          <p className="font-semibold text-[10px] text-zinc-500 uppercase tracking-wider">
            Select Agent Mode
          </p>
        </div>
        <Separator className="my-1 bg-zinc-800" />
        <div className="grid gap-1">
          {modes.map((mode) => (
            <button
              className={cn(
                "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors",
                activeMode === mode.name
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
                isSwitching && "cursor-not-allowed opacity-50"
              )}
              disabled={isSwitching}
              key={mode.name}
              onClick={() => handleSwitch(mode.name)}
              type="button"
            >
              <div className="flex w-full items-center gap-2">
                <span className="font-bold text-xs capitalize">
                  {mode.name}
                </span>
                {activeMode === mode.name && (
                  <Check className="ml-auto h-3 w-3" />
                )}
              </div>
              {mode.description && (
                <span className="text-[10px] leading-tight opacity-60">
                  {mode.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
