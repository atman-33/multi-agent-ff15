import { useCallback } from "react";

const HANDLE_SIZE = 14;

type ResizeDirection =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

async function startResize(direction: ResizeDirection) {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const appWindow = getCurrentWindow();
  const maximized = await appWindow.isMaximized();
  if (maximized) return;
  await appWindow.startResizeDragging(direction);
}

export function WindowResizeHandles() {
  const onResizeMouseDown = useCallback(
    (direction: ResizeDirection) => async (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      await startResize(direction);
    },
    []
  );

  return (
    <>
      <div
        className="absolute bottom-0 left-0 right-0 z-20"
        style={{ height: HANDLE_SIZE, cursor: "ns-resize" }}
        onMouseDown={onResizeMouseDown("South")}
      />
      <div
        className="absolute bottom-0 left-0 z-20"
        style={{ width: HANDLE_SIZE, top: "var(--titlebar-height)", cursor: "ew-resize" }}
        onMouseDown={onResizeMouseDown("West")}
      />
      <div
        className="absolute bottom-0 right-0 z-20"
        style={{ width: HANDLE_SIZE, top: "var(--titlebar-height)", cursor: "ew-resize" }}
        onMouseDown={onResizeMouseDown("East")}
      />

      <div
        className="absolute left-0 z-20"
        style={{ top: "var(--titlebar-height)", width: HANDLE_SIZE + 6, height: HANDLE_SIZE + 6, cursor: "nwse-resize" }}
        onMouseDown={onResizeMouseDown("NorthWest")}
      />
      <div
        className="absolute right-0 z-20"
        style={{ top: "var(--titlebar-height)", width: HANDLE_SIZE + 6, height: HANDLE_SIZE + 6, cursor: "nesw-resize" }}
        onMouseDown={onResizeMouseDown("NorthEast")}
      />
      <div
        className="absolute bottom-0 left-0 z-20"
        style={{ width: HANDLE_SIZE + 6, height: HANDLE_SIZE + 6, cursor: "nesw-resize" }}
        onMouseDown={onResizeMouseDown("SouthWest")}
      />
      <div
        className="absolute bottom-0 right-0 z-20"
        style={{ width: HANDLE_SIZE + 6, height: HANDLE_SIZE + 6, cursor: "nwse-resize" }}
        onMouseDown={onResizeMouseDown("SouthEast")}
      />
    </>
  );
}
