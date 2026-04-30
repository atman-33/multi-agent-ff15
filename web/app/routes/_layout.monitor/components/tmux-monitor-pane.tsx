import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { TmuxMonitorAgentStatus, TmuxMonitorPane } from "@/lib/tmux-monitor.server";

type TmuxMonitorPaneCardProps = {
  pane: TmuxMonitorPane;
  status: TmuxMonitorAgentStatus;
};

type TerminalStyleState = {
  backgroundColor: string | null;
  color: string | null;
  fontWeight: CSSProperties["fontWeight"] | null;
};

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI SGR escape codes intentionally include ESC.
const ANSI_SGR_REGEX = /\u001b\[([0-9;]*)m/g;

const ANSI_BASE_PALETTE = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
] as const;

const STATUS_TONE_CLASS_NAMES: Record<TmuxMonitorAgentStatus, string> = {
  busy: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  idle: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  offline: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  retry: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  unknown: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

function createDefaultTerminalStyle(): TerminalStyleState {
  return {
    backgroundColor: null,
    color: null,
    fontWeight: null,
  };
}

function rgbString(red: number, green: number, blue: number): string {
  return `rgb(${red},${green},${blue})`;
}

function ansi256Color(index: number): string {
  if (index < 16) {
    const [red, green, blue] = ANSI_BASE_PALETTE[index] ?? ANSI_BASE_PALETTE[0];
    return rgbString(red, green, blue);
  }

  if (index >= 232) {
    const value = 8 + (index - 232) * 10;
    return rgbString(value, value, value);
  }

  const cubeIndex = index - 16;
  const red = Math.floor(cubeIndex / 36);
  const green = Math.floor((cubeIndex % 36) / 6);
  const blue = cubeIndex % 6;
  const toChannel = (value: number) => (value === 0 ? 0 : 55 + value * 40);

  return rgbString(toChannel(red), toChannel(green), toChannel(blue));
}

function basicColor(code: number): string | null {
  if (code >= 30 && code <= 37) {
    const [red, green, blue] = ANSI_BASE_PALETTE[code - 30] ?? ANSI_BASE_PALETTE[0];
    return rgbString(red, green, blue);
  }

  if (code >= 90 && code <= 97) {
    const [red, green, blue] = ANSI_BASE_PALETTE[code - 90 + 8] ?? ANSI_BASE_PALETTE[8];
    return rgbString(red, green, blue);
  }

  return null;
}

function basicBackgroundColor(code: number): string | null {
  if (code >= 40 && code <= 47) {
    const [red, green, blue] = ANSI_BASE_PALETTE[code - 40] ?? ANSI_BASE_PALETTE[0];
    return rgbString(red, green, blue);
  }

  if (code >= 100 && code <= 107) {
    const [red, green, blue] = ANSI_BASE_PALETTE[code - 100 + 8] ?? ANSI_BASE_PALETTE[8];
    return rgbString(red, green, blue);
  }

  return null;
}

function applyAnsiCodes(input: TerminalStyleState, rawCodes: number[]): TerminalStyleState {
  let next = { ...input };
  const codes = rawCodes.length > 0 ? rawCodes : [0];

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index] ?? 0;

    if (code === 0) {
      next = createDefaultTerminalStyle();
      continue;
    }

    if (code === 1) {
      next.fontWeight = 700;
      continue;
    }

    if (code === 22) {
      next.fontWeight = null;
      continue;
    }

    if (code === 39) {
      next.color = null;
      continue;
    }

    if (code === 49) {
      next.backgroundColor = null;
      continue;
    }

    const nextForeground = basicColor(code);
    if (nextForeground) {
      next.color = nextForeground;
      continue;
    }

    const nextBackground = basicBackgroundColor(code);
    if (nextBackground) {
      next.backgroundColor = nextBackground;
      continue;
    }

    if (code !== 38 && code !== 48) {
      continue;
    }

    const mode = codes[index + 1];
    if (mode === 2) {
      const red = codes[index + 2] ?? 0;
      const green = codes[index + 3] ?? 0;
      const blue = codes[index + 4] ?? 0;
      const value = rgbString(red, green, blue);
      if (code === 38) {
        next.color = value;
      } else {
        next.backgroundColor = value;
      }
      index += 4;
      continue;
    }

    if (mode === 5) {
      const paletteIndex = codes[index + 2] ?? 0;
      const value = ansi256Color(paletteIndex);
      if (code === 38) {
        next.color = value;
      } else {
        next.backgroundColor = value;
      }
      index += 2;
    }
  }

  return next;
}

function toReactStyle(state: TerminalStyleState): CSSProperties | undefined {
  const style: CSSProperties = {};

  if (state.color) {
    style.color = state.color;
  }

  if (state.backgroundColor) {
    style.backgroundColor = state.backgroundColor;
  }

  if (state.fontWeight) {
    style.fontWeight = state.fontWeight;
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function renderAnsiText(source: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let styleState = createDefaultTerminalStyle();
  let lastIndex = 0;
  let key = 0;

  for (const match of source.matchAll(ANSI_SGR_REGEX)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      const chunk = source.slice(lastIndex, matchIndex);
      const style = toReactStyle(styleState);
      nodes.push(
        style ? (
          <span key={key} style={style}>
            {chunk}
          </span>
        ) : (
          <Fragment key={key}>{chunk}</Fragment>
        ),
      );
      key += 1;
    }

    const codes = (match[1] ?? "")
      .split(";")
      .filter((code) => code.length > 0)
      .map((code) => Number.parseInt(code, 10))
      .filter((code) => Number.isFinite(code));
    styleState = applyAnsiCodes(styleState, codes);
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < source.length || nodes.length === 0) {
    const chunk = lastIndex < source.length ? source.slice(lastIndex) : source;
    const style = toReactStyle(styleState);
    nodes.push(
      style ? (
        <span key={key} style={style}>
          {chunk}
        </span>
      ) : (
        <Fragment key={key}>{chunk}</Fragment>
      ),
    );
  }

  return nodes;
}

export function TmuxMonitorPaneCard({ pane, status }: TmuxMonitorPaneCardProps) {
  const renderedContent = useMemo(() => {
    const source = pane.content.length > 0 ? pane.content : "Waiting for output...";
    return renderAnsiText(source);
  }, [pane.content]);

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#0a0a0a] font-mono shadow-lg">
      <div className="flex items-center justify-between border-b border-white/5 bg-zinc-900/40 px-3 py-2">
        <div className="min-w-0">
          <div className="font-bold text-[11px] uppercase tracking-[0.24em] text-zinc-200">
            {pane.agentId}
          </div>
          <div className="truncate text-[10px] text-zinc-400">{pane.target}</div>
        </div>
        <Badge className={STATUS_TONE_CLASS_NAMES[status]} variant="outline">
          {status.toUpperCase()}
        </Badge>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max bg-[#0a0a0a] px-2 py-2">
          <pre className="m-0 whitespace-pre text-[11px] leading-none text-emerald-50">
            {renderedContent}
          </pre>
        </div>
      </div>
    </article>
  );
}