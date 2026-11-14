import { api } from "@/lib/api";

export interface ContentItem {
  key: string;
  value: string;
}

type ContentResponse = ContentItem[] | { items?: ContentItem[] };

let cachedContentMap: Record<string, string> | null = null;
let cacheTimestamp = 0;
let inflightPromise: Promise<Record<string, string>> | null = null;
const CACHE_TTL_MS = 60_000;

export function normalizeContentResponse(res: unknown): Record<string, string> {
  const list: ContentItem[] = Array.isArray(res)
    ? (res as ContentItem[])
    : Array.isArray((res as { items?: ContentItem[] } | null)?.items)
      ? ((res as { items: ContentItem[] }).items ?? [])
      : [];

  const map: Record<string, string> = {};
  for (const item of list) {
    if (
      item &&
      typeof item.key === "string" &&
      typeof item.value === "string" &&
      item.value.trim().length > 0
    ) {
      map[item.key] = item.value;
    }
  }
  return map;
}

export async function fetchSiteContentMap(options?: {
  forceRefresh?: boolean;
}): Promise<Record<string, string>> {
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    cachedContentMap &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedContentMap;
  }

  if (!options?.forceRefresh && inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = api
    .get<ContentResponse>("/admin/content", {
      signal:
        typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
          ? AbortSignal.timeout(5000)
          : undefined,
    })
    .then((res) => {
      const map = normalizeContentResponse(res);
      cachedContentMap = map;
      cacheTimestamp = Date.now();
      return map;
    })
    .catch(() => {
      return cachedContentMap ?? {};
    })
    .finally(() => {
      inflightPromise = null;
    });

  return inflightPromise;
}

export function invalidateSiteContentCache(): void {
  cachedContentMap = null;
  cacheTimestamp = 0;
  inflightPromise = null;
}
