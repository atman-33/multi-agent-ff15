export interface BanterRevealQueueOptions<T> {
  onReveal: (entry: T) => void;
  initialDelayMs?: number;
  computeDelay?: (remainingQueueLength: number) => number;
}

export interface BanterRevealQueue<T> {
  enqueue: (entries: T[]) => void;
  clear: () => void;
}

export function createBanterRevealQueue<T>(
  options: BanterRevealQueueOptions<T>,
): BanterRevealQueue<T> {
  const initialDelayMs = options.initialDelayMs ?? 90;
  const computeDelay = options.computeDelay ?? (() => 220);

  let queue: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleNext = (delay: number) => {
    timer = setTimeout(() => {
      timer = null;
      const nextEntry = queue.shift();
      if (nextEntry === undefined) {
        return;
      }

      options.onReveal(nextEntry);

      if (queue.length > 0) {
        scheduleNext(computeDelay(queue.length));
      }
    }, delay);
  };

  return {
    enqueue(entries: T[]) {
      if (entries.length === 0) {
        return;
      }

      queue.push(...entries);
      if (!timer) {
        scheduleNext(initialDelayMs);
      }
    },
    clear() {
      queue = [];
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}