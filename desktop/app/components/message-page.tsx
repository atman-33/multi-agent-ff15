import { invoke } from "@tauri-apps/api/core";
import { Loader2, Mail, MessageSquare, RefreshCw, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertCircle,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InboxMessage {
  content: string;
  from: string;
  id: string;
  msg_type: string;
  read: boolean;
  timestamp: string;
}

const ALLOWED_SENDERS = ["crystal", "user"];
interface MessagePageProps {
  agent: "noctis" | "lunafreya";
  title: string;
}

export default function MessagePage({ agent, title }: MessagePageProps) {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Send form state
  const [sendFrom, setSendFrom] = useState("crystal");
  const [sendContent, setSendContent] = useState("");
  const [sending, setSending] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const [count, msgs] = await Promise.all([
          invoke<number>("peek_inbox", { agent }),
          invoke<InboxMessage[]>("list_inbox_messages", { agent }),
        ]);
        setUnreadCount(count);
        setMessages(msgs);
      } else {
        const res = await fetch(`/api/inbox/${agent}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        setUnreadCount(data.count);
        setMessages(data.messages);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [agent, isTauri]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSend = async () => {
    const trimmed = sendContent.trim();
    if (!trimmed) {
      setValidationError("Please enter a message");
      return;
    }
    setValidationError(null);

    setSending(true);
    try {
      if (isTauri) {
        await invoke<string>("send_message", {
          target: agent,
          from: sendFrom,
          content: trimmed,
        });
      } else {
        const res = await fetch(`/api/inbox/${agent}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: sendFrom, content: trimmed }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }
      }
      toast.success("Successfully sent message");
      setSendContent("");
      await fetchData();
    } catch (e) {
      toast.error(`Send error: ${String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-sm">{title}</h2>
          {unreadCount > 0 && (
            <Badge
              className="h-5 min-w-[20px] justify-center px-1.5 py-0 text-[10px]"
              variant="default"
            >
              {unreadCount}
            </Badge>
          )}
        </div>
        <Button
          aria-label="Refresh messages"
          className="h-7 w-7"
          disabled={loading}
          onClick={fetchData}
          size="icon"
          variant="ghost"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Send Message Form */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Send className="h-3.5 w-3.5 text-primary" />
              Send Message
            </CardTitle>
            <CardDescription className="text-xs">
              Send a message to {agent}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    className="mb-1 block font-medium text-muted-foreground text-xs"
                    htmlFor="send-from"
                  >
                    From
                  </label>
                  <Select
                    onValueChange={(val) => setSendFrom(val)}
                    value={sendFrom}
                  >
                    <SelectTrigger className="h-9 w-full border-input bg-muted/40 text-foreground">
                      <SelectValue placeholder="Select sender" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOWED_SENDERS.map((sender) => (
                        <SelectItem key={sender} value={sender}>
                          {sender}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <span className="mb-1 block font-medium text-muted-foreground text-xs">
                    To
                  </span>
                  <div className="flex h-9 items-center rounded-md border border-input bg-muted/20 px-3 text-muted-foreground text-sm">
                    {agent}
                  </div>
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block font-medium text-muted-foreground text-xs"
                  htmlFor="send-content"
                >
                  Message
                </label>
                <textarea
                  className="min-h-[72px] w-full resize-y rounded-md border border-input bg-muted/40 px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                  id="send-content"
                  onChange={(e) => {
                    setSendContent(e.target.value);
                    if (validationError) {
                      setValidationError(null);
                    }
                  }}
                  placeholder="Enter message..."
                  rows={3}
                  value={sendContent}
                />
                <div className="mt-1 flex justify-between">
                  {validationError && (
                    <p className="text-destructive text-xs">
                      {validationError}
                    </p>
                  )}
                </div>
              </div>

              <Button
                className="w-full"
                disabled={sending || !sendContent.trim()}
                onClick={handleSend}
                size="sm"
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-3.5 w-3.5" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Message List */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-primary" />
              Inbox
            </CardTitle>
            <CardDescription className="text-xs">
              Read-only view. Messages are not marked as read.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    className={`rounded-lg border px-4 py-3 transition-colors ${
                      msg.read
                        ? "border-border/40 bg-muted/10"
                        : "border-primary/25 bg-primary/5"
                    }`}
                    key={msg.id}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!msg.read && (
                          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                        <span className="font-medium text-foreground text-xs">
                          {msg.from}
                        </span>
                        <Badge
                          className="h-4 px-1.5 py-0 text-[10px]"
                          variant="outline"
                        >
                          {msg.msg_type}
                        </Badge>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground/70">
                        {msg.timestamp}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/90 text-sm leading-relaxed">
                      {msg.content}
                    </p>
                    <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/50">
                      {msg.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
