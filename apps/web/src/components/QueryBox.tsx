import { useState } from "react";
import { curlFor } from "../arkiv";

/** Shows the exact Arkiv query a view ran, plus a curl anyone can paste to verify it. */
export function QueryBox({ text, title = "Arkiv query behind this view" }: { text: string; title?: string }) {
  const [copied, setCopied] = useState<"query" | "curl" | null>(null);
  if (!text) return null;
  const copy = (what: "query" | "curl") => {
    void navigator.clipboard?.writeText(what === "query" ? text : curlFor(text)).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return (
    <details className="querybox">
      <summary>
        {title} <span className="muted">(live, no HookTax server involved)</span>
      </summary>
      <pre>{text}</pre>
      <div className="row gap">
        <button onClick={() => copy("query")}>{copied === "query" ? "Copied" : "Copy query"}</button>
        <button onClick={() => copy("curl")}>{copied === "curl" ? "Copied" : "Copy curl (arkiv_query)"}</button>
      </div>
    </details>
  );
}
