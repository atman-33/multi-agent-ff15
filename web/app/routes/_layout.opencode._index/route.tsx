import { MessagesSquare } from "lucide-react";

const OpenCodeIndex = () => {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessagesSquare className="h-10 w-10 opacity-20" />
      <p className="text-sm">Select a session or create a new one to start chatting.</p>
    </div>
  );
};

export default OpenCodeIndex;
