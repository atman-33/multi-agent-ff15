import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { RefreshCw, Mail, Send } from "lucide-react";
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
  }, [agent]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSend = async () => {
    // Validation
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
      // Refresh after sending
      await fetchData();
    } catch (e) {
      toast.error(`送信エラー: ${String(e)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">{title}</h2>
          <Badge variant={unreadCount > 0 ? "default" : "secondary"}>
            {unreadCount} unread
          </Badge>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={fetchData}
          disabled={loading}
          aria-label="Refresh messages"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Send Message Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-4 w-4" />
            Send Message
          </CardTitle>
          <CardDescription>
            Send a message to {agent}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label
                  htmlFor="send-from"
                  className="block text-sm font-medium text-foreground mb-1"
                >
                  From
                </label>
                <select
                  id="send-from"
                  value={sendFrom}
                  onChange={(e) => setSendFrom(e.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ALLOWED_SENDERS.map((sender) => (
                    <option key={sender} value={sender}>
                      {sender}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-foreground mb-1">
                  To
                </label>
                <div className="h-10 rounded-md border border-input bg-muted px-3 flex items-center text-sm text-muted-foreground">
                  {agent}
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="send-content"
                className="block text-sm font-medium text-foreground mb-1"
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y min-h-[80px]"
              />
              <div className="flex justify-between mt-1">
                {validationError && (
                  <p className="text-sm text-destructive">{validationError}</p>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {sendContent.length}/{MAX_MESSAGE_LENGTH}
                </span>
              </div>
            </div>

            <Button
              onClick={handleSend}
              disabled={sending || !sendContent.trim()}
              className="w-full"
            >
              {sending ? "Sending..." : "Send Message"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Message List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Inbox
          </CardTitle>
          <CardDescription>
            Read-only view. Messages are not marked as read.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              メッセージはありません
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-lg border p-4 ${
                    msg.read ? "bg-background" : "bg-accent/50 border-primary/20"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={msg.read ? "secondary" : "default"}>
                        {msg.read ? "read" : "unread"}
                      </Badge>
                      <span className="text-sm font-medium">
                        from: {msg.from}
                      </span>
                      <Badge variant="outline">{msg.msg_type}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {msg.timestamp}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    ID: {msg.id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
