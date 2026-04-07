export function createOpencodeMessageId(): string {
  return `msg_${crypto.randomUUID()}`;
}