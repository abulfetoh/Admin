import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/locale";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/ar/admin", "/employer", "/ar/employer", "/account", "/ar/account", "/api/", "/unsubscribe"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
