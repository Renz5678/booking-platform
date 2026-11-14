import type { MetadataRoute } from "next";
import { site } from "@/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["/", "/counselors", "/faq", "/contact", "/privacy-policy"];
  return routes.map((path) => ({
    url: `${site.url}${path}`,
    lastModified: new Date(),
  }));
}
