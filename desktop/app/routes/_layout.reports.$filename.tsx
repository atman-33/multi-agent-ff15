import {
  Archive,
  Check,
  Clipboard,
  Clock,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  appendToChatDraft,
  getStoredActiveChatTarget,
  type DraftTargetAgentId,
} from "@/lib/chat-drafts";

const TARGET_OPTIONS: Array<{ label: string; value: DraftTargetAgentId }> = [
  { label: "Noctis", value: "noctis" },
  { label: "Lunafreya", value: "lunafreya" },
  { label: "Ignis", value: "ignis" },
  { label: "Gladiolus", value: "gladiolus" },
  { label: "Prompto", value: "prompto" },
];

interface ReportsOutletContext {
  archiveReport: (
    filename: string,
    action: "archive" | "restore"
  ) => Promise<void>;
}

export default function ReportDetail() {
  const { filename } = useParams<{ filename: string }>();
  const [searchParams] = useSearchParams();
  const isArchived = searchParams.get("archived") === "true";
  const navigate = useNavigate();
  const { archiveReport } = useOutletContext<ReportsOutletContext>();

  const [content, setContent] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [author, setAuthor] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<DraftTargetAgentId | "">(
    ""
  );
  const [showTargetDialog, setShowTargetDialog] = useState(false);

  const fetchContent = useCallback(async () => {
    if (!filename) {
      return;
    }
    setLoading(true);
    setContent("");
    try {
      const archivedParam = isArchived ? "&archived=true" : "";
      const res = await fetch(
        `/api/report?file=${encodeURIComponent(filename)}${archivedParam}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setContent(data.content || "");
      setTitle(data.title || filename);
      setAuthor(data.author || "");
      setDate(data.date || "");
      setFilePath(data.filePath || "");
    } catch (e) {
      setContent(`Failed to load content: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [filename, isArchived]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  const handleCopy = async () => {
    if (!content) {
      return;
    }
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleArchiveAction = async () => {
    if (!filename) {
      return;
    }
    setArchiving(true);
    try {
      await archiveReport(filename, isArchived ? "restore" : "archive");
      navigate("/reports");
    } finally {
      setArchiving(false);
    }
  };

  const insertReportIntoDraft = (target: DraftTargetAgentId) => {
    if (!filePath) {
      toast.error("Report path is not ready yet.");
      return;
    }

    appendToChatDraft(target, filePath);
    toast.success(`Inserted report into ${target} draft`);
    navigate("/chat");
  };

  const handleInsertToChat = () => {
    const inferredTarget = getStoredActiveChatTarget();
    if (inferredTarget) {
      insertReportIntoDraft(inferredTarget);
      return;
    }

    setSelectedTarget("");
    setShowTargetDialog(true);
  };

  return (
    <div className="absolute inset-0 flex h-full flex-col">
      {/* Detail header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-border/50 border-b bg-background/50 px-6 py-4 backdrop-blur-sm">
        <div className="mr-4 min-w-0 flex-1">
          <h3 className="truncate font-semibold text-lg">
            {title || filename}
          </h3>
          <div className="mt-1.5 flex items-center gap-3 text-muted-foreground text-xs">
            {author && (
              <span className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-medium text-primary">
                <User className="h-3.5 w-3.5" />
                {author}
              </span>
            )}
            {date && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(date).toLocaleString()}
              </span>
            )}
            {isArchived && (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 font-medium text-amber-600 text-xs dark:text-amber-400">
                Archived
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            className="h-7 gap-1.5 text-xs"
            disabled={loading || !filePath}
            onClick={handleInsertToChat}
            size="sm"
            variant="outline"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Insert to Chat
          </Button>
          {/* Copy raw markdown button */}
          <Button
            className="h-7 gap-1.5 text-xs"
            disabled={loading || !content}
            onClick={handleCopy}
            size="sm"
            variant="outline"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                Copied!
              </>
            ) : (
              <>
                <Clipboard className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </Button>
          {/* Archive / Restore button */}
          <Button
            className="h-7 gap-1.5 text-xs"
            disabled={archiving}
            onClick={handleArchiveAction}
            size="sm"
            variant="outline"
          >
            {isArchived ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" />
                Archive
              </>
            )}
          </Button>
          {/* Mobile back button */}
          <Button
            className="md:hidden"
            onClick={() => navigate("/reports")}
            size="icon"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog onOpenChange={setShowTargetDialog} open={showTargetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Chat Target</DialogTitle>
            <DialogDescription>
              Choose which agent draft should receive this report reference.
            </DialogDescription>
          </DialogHeader>
          <Select
            onValueChange={(value) =>
              setSelectedTarget(value as DraftTargetAgentId)
            }
            value={selectedTarget}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
              {TARGET_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              onClick={() => setShowTargetDialog(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedTarget}
              onClick={() => {
                if (!selectedTarget) {
                  return;
                }
                setShowTargetDialog(false);
                insertReportIntoDraft(selectedTarget);
              }}
              type="button"
            >
              Insert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail content */}
      <div className="flex-1 overflow-auto p-4 md:p-8">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
            <span className="text-sm">Loading content...</span>
          </div>
        ) : (
          <Card className="mx-auto h-auto min-h-full max-w-4xl border-border/50 shadow-sm">
            <CardContent className="px-5 pt-6 pb-8 md:px-10">
              <div className="markdown-body text-sm md:text-base">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content || "*No content.*"}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
