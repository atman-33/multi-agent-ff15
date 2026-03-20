export const TASK_TIMEOUT_MS = 120_000;
export const NOCTIS_DECOMPOSE_TIMEOUT_MS = 30_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}
