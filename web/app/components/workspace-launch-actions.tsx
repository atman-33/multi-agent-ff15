import { Check, ChevronDown, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getPreferenceLabel,
  getResolvedTargetLabel,
  type VSCodePreference,
} from "@/lib/vscode-preferences";
import { cn } from "@/lib/utils";

const VSCODE_OPTIONS = (resolvedTargetLabel: string) => [
  {
    preference: "auto" as const,
    label: `Auto (${resolvedTargetLabel})`,
    description: "Choose based on the project path.",
  },
  {
    preference: "wsl" as const,
    label: "Open in WSL",
    description: "Always launch through the WSL code command.",
  },
  {
    preference: "windows" as const,
    label: "Open in Windows",
    description: "Use native Windows VS Code when possible.",
  },
];

const openFolder = async (path: string) => {
  try {
    const res = await fetch("/api/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });

    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      throw new Error((result as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  } catch (error) {
    toast.error("Open folder failed", { description: String(error) });
  }
};

const openVSCode = async (path: string, preference: VSCodePreference) => {
  try {
    const res = await fetch("/api/open-vscode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, preference }),
    });

    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      throw new Error((result as { error?: string }).error ?? `HTTP ${res.status}`);
    }
  } catch (error) {
    toast.error("Open in VS Code failed", { description: String(error) });
  }
};

type WorkspaceLaunchActionsProps = {
  path: string;
  vscodePreference: VSCodePreference;
  onVSCodePreferenceChange?: (preference: VSCodePreference) => void;
  disabled?: boolean;
  stopPropagation?: boolean;
  className?: string;
};

export const WorkspaceLaunchActions = ({
  path,
  vscodePreference,
  onVSCodePreferenceChange,
  disabled = false,
  stopPropagation = false,
  className,
}: WorkspaceLaunchActionsProps) => {
  const resolvedTargetLabel = getResolvedTargetLabel(path, vscodePreference);

  const handleStopPropagation = (event: { stopPropagation: () => void }) => {
    if (stopPropagation) {
      event.stopPropagation();
    }
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        className="h-8 w-8 text-muted-foreground hover:text-primary"
        disabled={disabled}
        onClick={(event) => {
          handleStopPropagation(event);
          void openFolder(path);
        }}
        size="icon"
        title="Open folder"
        type="button"
        variant="ghost"
      >
        <FolderOpen className="h-4 w-4" />
      </Button>
      <div className="flex items-center">
        <Button
          className="h-8 gap-1 rounded-r-none border-r-0 px-2.5 text-[11px]"
          disabled={disabled}
          onClick={(event) => {
            handleStopPropagation(event);
            void openVSCode(path, vscodePreference);
          }}
          size="sm"
          title={`Open in VS Code (${getPreferenceLabel(vscodePreference)} -> ${resolvedTargetLabel})`}
          type="button"
          variant="outline"
        >
          <span>VS Code</span>
          <span className="text-[10px] text-muted-foreground/80">{getPreferenceLabel(vscodePreference)}</span>
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              className="h-8 rounded-l-none px-2 text-muted-foreground"
              disabled={disabled}
              onClick={(event) => handleStopPropagation(event)}
              size="sm"
              title="Choose VS Code launch mode"
              type="button"
              variant="outline"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-60 p-1"
            onClick={(event) => handleStopPropagation(event)}
          >
            <div className="px-2 py-1.5">
              <p className="font-medium text-xs">Open in VS Code</p>
              <p className="text-[11px] text-muted-foreground">
                Auto uses WSL for Linux paths and Windows for /mnt drives.
              </p>
            </div>
            <div className="grid gap-1">
              {VSCODE_OPTIONS(resolvedTargetLabel).map((option) => (
                <button
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left text-xs transition-colors",
                    vscodePreference === option.preference
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60",
                  )}
                  key={option.preference}
                  onClick={(event) => {
                    handleStopPropagation(event);
                    onVSCodePreferenceChange?.(option.preference);
                    void openVSCode(path, option.preference);
                  }}
                  type="button"
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="font-medium">{option.label}</span>
                    {vscodePreference === option.preference ? (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    ) : null}
                  </div>
                  <span className="text-[11px] text-muted-foreground">{option.description}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
