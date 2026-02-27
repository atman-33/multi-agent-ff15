import {
  Bell,
  CheckCheck,
  Mail,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { useEffect } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCrystalInboxStore } from "@/stores/crystal-inbox-store";

/** Replace literal \n sequences with real newlines for display */
function formatContent(content: string): string {
  return content.replace(/\\n/g, "\n");
}

export default function CrystalInboxPage() {
  const {
    messages,
    unreadCount,
    error,
    loading,
    markingAll,
    fetchData,
    markAsRead,
    markAllAsRead,
  } = useCrystalInboxStore();

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
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button
              aria-label="Mark all as read"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={markingAll}
              onClick={markAllAsRead}
              size="sm"
              variant="ghost"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
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
              Push notifications from Iris and other agents — click to mark as
              read
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
                  <button
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-all ${
                      msg.read
                        ? "border-border/40 bg-muted/10 opacity-60"
                        : "border-primary/25 bg-primary/5 hover:border-primary/40 hover:bg-primary/10 cursor-pointer"
                    }`}
                    key={msg.id}
                    onClick={() => {
                      if (!msg.read) markAsRead(msg.id);
                    }}
                    type="button"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!msg.read && (
                          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
                        )}
                        <span
                          className={`text-xs ${msg.read ? "text-muted-foreground" : "font-medium text-foreground"}`}
                        >
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
                      {formatContent(msg.content)}
                    </p>
                    <div className="mt-1.5 font-mono text-[10px] text-muted-foreground/50">
                      {msg.id}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
