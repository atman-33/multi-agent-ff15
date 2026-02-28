import { FileText } from "lucide-react";

export default function ReportsIndex() {
  return (
    <div className="fade-in flex h-full w-full animate-in flex-col items-center justify-center text-muted-foreground/60 duration-500">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
        <FileText className="h-8 w-8 text-muted-foreground/40" />
      </div>
      <p className="font-medium text-sm">No report selected</p>
      <p className="mt-1 text-muted-foreground/50 text-xs">
        Choose a report from the sidebar to view its details
      </p>
    </div>
  );
}
