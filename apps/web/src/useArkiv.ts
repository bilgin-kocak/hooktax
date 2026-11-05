import { useEffect, useState } from "react";

export interface RunnableQuery<T> {
  toString(): string;
  fetch(): Promise<T>;
}

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  text: string;
}

/** Run an Arkiv query whenever `deps` change; expose its query-language text for display. */
export function useArkivQuery<T>(make: () => RunnableQuery<T> | null, deps: unknown[]): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: null, error: null, loading: true, text: "" });
  useEffect(() => {
    let cancelled = false;
    let q: RunnableQuery<T> | null = null;
    try {
      q = make();
    } catch (err) {
      setState({ data: null, error: String(err instanceof Error ? err.message : err), loading: false, text: "" });
      return;
    }
    if (!q) {
      setState({ data: null, error: null, loading: false, text: "" });
      return;
    }
    const text = q.toString();
    setState((s) => ({ ...s, loading: true, error: null, text }));
    q.fetch().then(
      (data) => !cancelled && setState({ data, error: null, loading: false, text }),
      (err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // Never echo URLs: the RPC URL can carry an access key as a path segment.
        setState({ data: null, error: msg.replace(/https?:\/\/\S+/g, "<rpc>").slice(0, 300), loading: false, text });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

/** Read `.value` from an Arkiv row column, if present. */
export function val<T = unknown>(row: Record<string, unknown> | undefined, name: string): T | undefined {
  const cell = row?.[name] as { value: T } | undefined;
  return cell?.value;
}
