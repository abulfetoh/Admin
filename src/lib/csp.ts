/**
 * Content-Security-Policy with a per-request nonce (no 'unsafe-inline' for scripts).
 * `strict-dynamic` lets nonce-carrying scripts load their own dependencies (Next's chunks, and the AdSense loader if enabled).
 */
export function buildCsp(nonce: string, opts: { dev?: boolean; ads?: boolean } = {}): string {
  const d: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", ...(opts.dev ? ["'unsafe-inline'"] : [])],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(opts.dev ? ["ws:", "wss:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (opts.ads) {
    // Best-effort allowances for Google AdSense; NOT verified against a live AdSense account.
    d["img-src"].push("https:");
    d["frame-src"] = ["https://googleads.g.doubleclick.net", "https://tpc.googlesyndication.com", "https://*.googlesyndication.com"];
    d["connect-src"].push("https://*.google.com", "https://*.doubleclick.net", "https://*.googlesyndication.com");
  }
  const parts = Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export const newNonce = (): string => btoa(crypto.randomUUID());
