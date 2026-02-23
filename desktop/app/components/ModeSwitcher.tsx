import { useState, useEffect } from "react";
import { Zap, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Mode {
  name: string;
  description: string;
}

export default function ModeSwitcher() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [activeMode, setActiveMode] = useState<string>("normal");
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchModes = async () => {
      try {
        const res = await fetch("/api/modes");
        if (!res.ok) throw new Error("Failed to fetch modes");
        const data = await res.json();
        setModes(data.modes || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchModes();
  }, []);

  const handleSwitch = async (modeName: string) => {
    if (modeName === activeMode || isSwitching) return;

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
    } catch (e) {
      toast.error(`Mode switch failed: ${String(e)}`);
      setActiveMode(prevMode);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-6 px-2 text-[10px] gap-1.5 transition-all duration-200",
            isSwitching ? "border-amber-500/50 bg-amber-500/10 text-amber-500" : "border-border/40 hover:bg-white/5"
          )}
          disabled={isLoading}
        >
          {isSwitching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Zap className={cn("h-3 w-3", activeMode !== "normal" && "text-amber-400 fill-amber-400/20")} />
          )}
          <span className="font-medium opacity-90">Mode:</span>
          <span className="capitalize font-bold">{activeMode}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 bg-zinc-900 border-zinc-800 shadow-xl" align="start">
        <div className="px-2 py-1.5">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Select Agent Mode</p>
        </div>
        <Separator className="my-1 bg-zinc-800" />
        <div className="grid gap-1">
          {modes.map((mode) => (
            <button
              key={mode.name}
              onClick={() => handleSwitch(mode.name)}
              disabled={isSwitching}
              className={cn(
                "flex flex-col items-start gap-0.5 w-full rounded-md px-2 py-2 text-left transition-colors",
                activeMode === mode.name
                  ? "bg-amber-500/10 text-amber-400"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
                isSwitching && "opacity-50 cursor-not-allowed"
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <span className="text-xs font-bold capitalize">{mode.name}</span>
                {activeMode === mode.name && <Check className="ml-auto h-3 w-3" />}
              </div>
              {mode.description && (
                <span className="text-[10px] opacity-60 leading-tight">{mode.description}</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
