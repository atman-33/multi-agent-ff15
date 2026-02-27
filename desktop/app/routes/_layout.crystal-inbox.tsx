import { invoke } from "@tauri-apps/api/core";
import { Bell, Mail, MessageSquare, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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

interface InboxMessage {
  content: string;
  from: string;
  id: string;
  msg_type: string;
  read: boolean;
  timestamp: string;
}

export default function CrystalInboxPage() {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isTauri) {
        const [count, msgs] = await Promise.all([
          invoke<number>("peek_inbox", { agent: "crystal" }),
          invoke<InboxMessage[]>("list_inbox_messages", { agent: "crystal" }),
        ]);
        setUnreadCount(count);
        setMessages(msgs);
      } else {
        const res = await fetch("/api/inbox/crystal");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setUnreadCount(data.count);
        setMessages(data.messages);
      }
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [isTauri]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="flex h-full flex-col">
      {/* Sticky toolbar */}
      <div className="flex shrink-0 items-center justify-between border-border/50 border-b bg-card/40 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-sm">Crystal Inbox</h2>
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
      <div className="flex-1 overflow-auto px-5 py-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-primary" />
              Notifications
            </CardTitle>
            <CardDescription className="text-xs">
              Push notifications from Iris and other agents
            </CardDescription>
          </CardHeader>
          <CardContent>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-sm">No notifications</p>
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
