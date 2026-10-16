"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { CONSENT_COOKIE, parseConsent, serializeConsent, type Consent } from "@/lib/consent";

interface Labels { text: string; accept: string; reject: string }

function readCookie(): Consent | null {
  const m = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(m?.slice(CONSENT_COOKIE.length + 1));
}

export function ConsentAndTracking({ labels, locale, adsClient, gpc }: { labels: Labels; locale: string; adsClient?: string; gpc: boolean }) {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const path = usePathname();
  useEffect(() => setConsent(readCookie()), []);

  useEffect(() => {
    if (consent?.analytics && !gpc) {
      navigator.sendBeacon?.("/api/collect", new Blob([JSON.stringify({ path, locale, referrer: document.referrer })], { type: "application/json" }));
    }
  }, [consent, path, locale, gpc]);

  const choose = (c: Consent) => {
    document.cookie = `${CONSENT_COOKIE}=${serializeConsent(c)}; path=/; max-age=15552000; samesite=lax`;
    setConsent(c);
  };

  return (
    <>
      {consent?.ads && !gpc && adsClient && (
        <Script async strategy="afterInteractive" crossOrigin="anonymous" src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsClient)}`} />
      )}
      {consent === null && !gpc && <div aria-hidden className="h-32 sm:h-20" />}
      {consent === null && !gpc && (
        <div role="dialog" aria-label="Cookies" className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-300 bg-white p-4 shadow-lg">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
            <p className="flex-1 text-sm">{labels.text}</p>
            <button onClick={() => choose({ analytics: false, ads: false })} className="rounded border border-slate-400 px-3 py-1 text-sm">{labels.reject}</button>
            <button onClick={() => choose({ analytics: true, ads: true })} className="rounded bg-slate-900 px-3 py-1 text-sm text-white">{labels.accept}</button>
          </div>
        </div>
      )}
    </>
  );
}
