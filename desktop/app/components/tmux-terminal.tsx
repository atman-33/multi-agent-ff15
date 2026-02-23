import { useMemo } from "react";

interface TmuxTerminalProps {
  content: string;
  name: string;
}

// Basic ANSI stripper for now.
// Future improvement: use a library or more complex regex to support colors.
const ansiRegex =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export const TmuxTerminal = ({ content, name }: TmuxTerminalProps) => {
  const cleanContent = useMemo(() => {
    return content.replace(ansiRegex, "");
  }, [content]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-[#002b36] font-mono text-[10px] leading-tight shadow-lg">
      <div className="flex items-center justify-between border-white/5 border-b bg-zinc-900/40 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-bold text-zinc-300 uppercase tracking-widest">
            {name}
          </span>
        </div>
      </div>
      <div className="custom-scrollbar flex-1 overflow-auto p-2">
        <pre className="whitespace-pre text-emerald-50/80 drop-shadow-sm">
          {cleanContent || "Waiting for output..."}
        </pre>
      </div>
    </div>
  );
};
