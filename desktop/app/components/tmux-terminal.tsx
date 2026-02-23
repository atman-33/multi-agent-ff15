import { useMemo } from "react";

interface TmuxTerminalProps {
  content: string;
  name: string;
}

// Basic ANSI stripper for now. 
// Future improvement: use a library or more complex regex to support colors.
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export const TmuxTerminal = ({ content, name }: TmuxTerminalProps) => {
  const cleanContent = useMemo(() => {
    return content.replace(ansiRegex, "");
  }, [content]);

  return (
    <div className="flex flex-col h-full bg-[#002b36] border border-zinc-800 rounded-lg overflow-hidden font-mono text-[10px] leading-tight shadow-lg">
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-900/40 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-zinc-300 uppercase tracking-widest">{name}</span>
        </div>
      </div>
      <div className="flex-1 p-2 overflow-auto custom-scrollbar">
        <pre className="whitespace-pre text-emerald-50/80 drop-shadow-sm">
          {cleanContent || "Waiting for output..."}
        </pre>
      </div>
    </div>
  );
};
