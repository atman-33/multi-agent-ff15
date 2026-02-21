import { useRef, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// Dynamically import Tauri window API to avoid SSR issues
async function getAppWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

const ENABLE_WINDOW_DEBUG_LOG =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("debugWindow") === "1";

async function logWindowGeometry(label: string) {
  if (!ENABLE_WINDOW_DEBUG_LOG) return;
  const [{ currentMonitor }, appWindow] = await Promise.all([
    import("@tauri-apps/api/window"),
    getAppWindow(),
  ]);
  const [monitor, pos, size, maximized] = await Promise.all([
    currentMonitor(),
    appWindow.outerPosition(),
    appWindow.outerSize(),
    appWindow.isMaximized(),
  ]);
  console.info("[window-debug]", label, {
    maximized,
    window: {
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    },
    monitor: monitor
      ? {
          scaleFactor: monitor.scaleFactor,
          position: monitor.position,
          size: monitor.size,
          workArea: monitor.workArea,
        }
      : null,
  });
}

export function TitleBar() {
  const [isFittedToScreen, setIsFittedToScreen] = useState(false);
  const restoreBoundsRef = useRef<{
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);

  const handleMinimize = async () => {
    const appWindow = await getAppWindow();
    await appWindow.minimize();
  };

  const handleToggleFitToScreen = async () => {
    const [{ currentMonitor, PhysicalPosition, PhysicalSize }, appWindow] = await Promise.all([
      import("@tauri-apps/api/window"),
      getAppWindow(),
    ]);

    await logWindowGeometry("before-fit-toggle");

    if (isFittedToScreen) {
      const restore = restoreBoundsRef.current;
      if (!restore) return;
      await appWindow.setSize(new PhysicalSize(restore.size.width, restore.size.height));
      await appWindow.setPosition(new PhysicalPosition(restore.position.x, restore.position.y));
      setIsFittedToScreen(false);
      restoreBoundsRef.current = null;
      await logWindowGeometry("after-fit-restore");
      return;
    }

    const [monitor, pos, size] = await Promise.all([
      currentMonitor(),
      appWindow.outerPosition(),
      appWindow.outerSize(),
    ]);
    if (!monitor) return;

    restoreBoundsRef.current = {
      position: { x: pos.x, y: pos.y },
      size: { width: size.width, height: size.height },
    };

    await appWindow.setPosition(
      new PhysicalPosition(monitor.workArea.position.x, monitor.workArea.position.y)
    );
    await appWindow.setSize(
      new PhysicalSize(monitor.workArea.size.width, monitor.workArea.size.height)
    );
    setIsFittedToScreen(true);
    await logWindowGeometry("after-fit-expand");
  };

  const handleClose = async () => {
    const appWindow = await getAppWindow();
    await appWindow.close();
  };

  const handleStartDrag = async (e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (isFittedToScreen) return;
    const appWindow = await getAppWindow();
    await appWindow.startDragging();
  };

  const handleTitleDoubleClick = async () => {
    await handleToggleFitToScreen();
  };

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between select-none shrink-0"
      style={{ height: "var(--titlebar-height)" }}
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
          onMouseDown={(e) => e.stopPropagation()}
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
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggleFitToScreen}
          aria-label={isFittedToScreen ? "Restore" : "Fit to screen"}
          className={cn(
            "h-full px-4 flex items-center justify-center",
            "text-muted-foreground hover:text-foreground hover:bg-white/5",
            "transition-colors duration-150"
          )}
        >
          {isFittedToScreen ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>
        <button
          onMouseDown={(e) => e.stopPropagation()}
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
