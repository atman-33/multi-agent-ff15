import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// Dynamically import Tauri window API to avoid SSR issues
async function getAppWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    (async () => {
      const appWindow = await getAppWindow();
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);

      const unlisten = await appWindow.onResized(async () => {
        const max = await appWindow.isMaximized();
        setIsMaximized(max);
      });
      unlistenFn = unlisten;
    })();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleMinimize = async () => {
    const appWindow = await getAppWindow();
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    const appWindow = await getAppWindow();
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    const appWindow = await getAppWindow();
    await appWindow.close();
  };

  const handleStartDrag = async (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const appWindow = await getAppWindow();
    await appWindow.startDragging();
  };

  const handleTitleDoubleClick = async () => {
    const appWindow = await getAppWindow();
    await appWindow.toggleMaximize();
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between select-none shrink-0"
      style={{ height: "var(--titlebar-height)" }}
      onMouseDown={handleStartDrag}
      onDoubleClick={handleTitleDoubleClick}
    >
      {/* Left: App icon + title — drag area */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 px-4 flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleStartDrag}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-primary/80 shrink-0" />
        <span className="text-xs font-medium text-muted-foreground tracking-wide">
          Multi-Agent FF15
        </span>
      </div>

      {/* Center: drag handle spacer */}
      <div
        data-tauri-drag-region
        className="flex-1 cursor-grab active:cursor-grabbing"
        onMouseDown={handleStartDrag}
      />

      {/* Right: window controls — NO drag region */}
      <div className="flex items-center h-full">
        <button
          onClick={handleMinimize}
          aria-label="Minimize"
          className={cn(
            "h-full px-4 flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-white/5",
            "transition-colors duration-150"
          )}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          className={cn(
            "h-full px-4 flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-white/5",
            "transition-colors duration-150"
          )}
        >
          {isMaximized ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={handleClose}
          aria-label="Close"
          className={cn(
            "h-full px-4 flex items-center justify-center",
            "text-muted-foreground hover:text-white hover:bg-red-500/80",
            "transition-colors duration-150"
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
