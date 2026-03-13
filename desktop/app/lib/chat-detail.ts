import type {
  ChatTimelineExecutionItem,
  ChatTimelineMessageItem,
} from "@/lib/chat-timeline";

export const MESSAGE_PREVIEW_MAX_CHARS = 800;
export const EXECUTION_PREVIEW_MAX_CHARS = 420;
export const EXECUTION_PREVIEW_MAX_TODOS = 4;

export type ChatDetailItem =
  | { type: "message"; item: ChatTimelineMessageItem }
  | { type: "execution"; item: ChatTimelineExecutionItem };

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars).trimEnd()}...`;
}

export function getExecutionInputText(
  item: ChatTimelineExecutionItem
): string | null {
  return item.input ? JSON.stringify(item.input, null, 2) : null;
}

export function hasVerboseExecutionContent(
  item: ChatTimelineExecutionItem
): boolean {
  const inputText = getExecutionInputText(item);

  return (
    (inputText?.length ?? 0) > EXECUTION_PREVIEW_MAX_CHARS ||
    (item.result?.length ?? 0) > EXECUTION_PREVIEW_MAX_CHARS ||
    item.todos.length > EXECUTION_PREVIEW_MAX_TODOS
  );
}