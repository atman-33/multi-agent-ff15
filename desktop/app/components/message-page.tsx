import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { RefreshCw, Mail, Send, Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle, AlertCircle } from "@/components/ui/alert";

interface InboxMessage {
  id: string;
  from: string;
  msg_type: string;
  timestamp: string;
  content: string;
  read: boolean;
}

const ALLOWED_SENDERS = ["crystal", "user"];
const MAX_MESSAGE_LENGTH = 4096;

interface MessagePageProps {
  agent: "noctis" | "lunafreya";
  title: string;
}

export default function MessagePage({ agent, title }: MessagePageProps) {
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
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
    if (!isTauri) {
      setError("Desktop app context is required. Please use `npm run desktop:dev`.");
      return;
    }
    setLoading(true);
    try {
      const [count, msgs] = await Promise.all([
        invoke<number>("peek_inbox", { agent }),
        invoke<InboxMessage[]>("list_inbox_messages", { agent }),
      ]);
      setUnreadCount(count);
      setMessages(msgs);
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
    if (!isTauri) {
      setValidationError("Desktop app context is required.");
      return;
    }
    const trimmed = sendContent.trim();
    if (!trimmed) {
      setValidationError("メッセージを入力してください");
      return;
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setValidationError(`メッセージは${MAX_MESSAGE_LENGTH}文字以内にしてください`);
      return;
    }
    setValidationError(null);

    setSending(true);
    try {
      await invoke<string>("send_message", {
        target: agent,
        from: sendFrom,
        content: trimmed,
      });
      toast.success("メッセージを送信しました");
      setSendContent("");
      await fetchData();
    } catch (e) {
      toast.error(`送信エラー: ${String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sticky toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50 bg-card/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {unreadCount > 0 && (
            <Badge
              variant="default"
              className="h-5 text-[10px] px-1.5 py-0 min-w-[20px] justify-center"
            >
              {unreadCount}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={fetchData}
          disabled={loading}
          aria-label="Refresh messages"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
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
            <CardTitle className="text-sm flex items-center gap-2">
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
                    htmlFor="send-from"
                    className="block text-xs font-medium text-muted-foreground mb-1"
                  >
                    From
                  </label>
                  <select
                    id="send-from"
                    value={sendFrom}
                    onChange={(e) => setSendFrom(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-muted/40 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                  >
                    {ALLOWED_SENDERS.map((sender) => (
                      <option key={sender} value={sender}>
                        {sender}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    To
                  </label>
                  <div className="h-9 rounded-md border border-input bg-muted/20 px-3 flex items-center text-sm text-muted-foreground">
                    {agent}
                  </div>
                </div>
              </div>

              <div>
                <label
                  htmlFor="send-content"
                  className="block text-xs font-medium text-muted-foreground mb-1"
                >
                  Message
                </label>
                <textarea
                  id="send-content"
                  value={sendContent}
                  onChange={(e) => {
                    setSendContent(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="メッセージを入力..."
                  rows={3}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[72px] text-foreground placeholder:text-muted-foreground/50"
                />
                <div className="flex justify-between mt-1">
                  {validationError && (
                    <p className="text-xs text-destructive">{validationError}</p>
                  )}
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">
                    {sendContent.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                </div>
              </div>

              <Button
                onClick={handleSend}
                disabled={sending || !sendContent.trim()}
                size="sm"
                className="w-full"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5 mr-2" />
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
            <CardTitle className="text-sm flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-primary" />
              Inbox
            </CardTitle>
            <CardDescription className="text-xs">
              Read-only view. Messages are not marked as read.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-sm">メッセージはありません</p>
              </div>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-lg border px-4 py-3 transition-colors ${
                      msg.read
                        ? "border-border/40 bg-muted/10"
                        : "border-primary/25 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {!msg.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block shrink-0" />
                        )}
                        <span className="text-xs font-medium text-foreground">
                          {msg.from}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          {msg.msg_type}
                        </Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground/70 shrink-0">
                        {msg.timestamp}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">
                      {msg.content}
                    </p>
                    <div className="mt-1.5 text-[10px] text-muted-foreground/50 font-mono">
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
