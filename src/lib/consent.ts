export interface Consent { analytics: boolean; ads: boolean }
export const CONSENT_COOKIE = "consent";
export const NO_CONSENT: Consent = { analytics: false, ads: false };

/** Absent / malformed cookie => nothing optional is allowed (opt-in model). */
export function parseConsent(raw: string | undefined | null): Consent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    return { analytics: v?.analytics === true, ads: v?.ads === true };
  } catch {
    return null;
  }
}
export const serializeConsent = (c: Consent) => encodeURIComponent(JSON.stringify(c));

/** Global Privacy Control signal: treat as a rejection of optional processing. */
export const gpcOptOut = (h: { get(n: string): string | null }) => h.get("sec-gpc") === "1";
