import type { NextConfig } from "next";

const prod = process.env.NODE_ENV === "production";

// Static security headers for every response. (The nonce-based Content-Security-Policy is set per request in src/proxy.ts.)
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []), // no "preload": a domain-wide, hard-to-undo commitment
];

const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default config;
