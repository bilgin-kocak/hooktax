export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function isRateLimitError(err: unknown): boolean {
  const msg = errorMessage(err);
  return /\b429\b|rate.?limit|too many requests|exceeded your limit|usage limit/i.test(msg);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const details = (err as { details?: unknown }).details;
    return `${err.message}${typeof details === "string" ? ` (${details})` : ""}`;
  }
  return String(err);
}

/** Remove anything URL-shaped from an error message before logging (URLs may embed API keys). */
export function redact(msg: string): string {
  return msg.replace(/https?:\/\/[^\s"')]+/g, (u) => {
    try {
      return `${new URL(u).protocol}//${new URL(u).hostname}/…`;
    } catch {
      return "<url>";
    }
  });
}
