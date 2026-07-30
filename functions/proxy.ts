const API_BASE_URL = "https://music-api.gdstudio.xyz/api.php";

const AUDIO_HOST_RULES: Array<{ pattern: RegExp; referer: string }> = [
  { pattern: /(^|\.)kuwo\.cn$/i, referer: "https://www.kuwo.cn/" },
  { pattern: /(^|\.)bilivideo\.com$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)bilibili\.com$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)hdslb\.com$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)akamaized\.net$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)joox\.com$/i, referer: "https://www.joox.com/" },
];

const STABLE_SOURCES = new Set(["netease", "joox", "bilibili"]);

const SAFE_RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
  "expires",
  "retry-after",
];

const CORS_BASE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

function handleOptions(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_BASE_HEADERS } });
}

function pickCacheControl(types: string, source?: string): string {
  const normalized = (types || "").toLowerCase();
  const normalizedSource = (source || "").toLowerCase();

  if (normalized === "pic") {
    return "public, max-age=86400, s-maxage=604800";
  }
  if (normalized === "lyric") {
    return "public, max-age=3600, s-maxage=86400";
  }
  if (normalized === "url") {
    return "public, max-age=600, s-maxage=600";
  }
  if (normalized === "search" || normalized === "playlist") {
    if (normalizedSource && STABLE_SOURCES.has(normalizedSource)) {
      return "public, max-age=10, s-maxage=30";
    }
    return "public, max-age=10, s-maxage=10";
  }
  return "public, max-age=30, s-maxage=60";
}

function buildResponseHeaders(upstreamHeaders: Headers, types: string, source?: string): Headers {
  const headers = new Headers();

  for (const key of SAFE_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(key);
    if (value != null) {
      headers.set(key, value);
    }
  }

  if (!headers.has("cache-control")) {
    headers.set("cache-control", pickCacheControl(types, source));
  }
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  headers.set("Access-Control-Allow-Origin", "*");

  return headers;
}

function buildUpstreamHeaders(request: Request, extra: Record<string, string> = {}): Headers {
  const headers = new Headers();
  const userAgent = request.headers.get("User-Agent");
  if (userAgent) {
    headers.set("User-Agent", userAgent);
  } else {
    headers.set("User-Agent", "Mozilla/5.0");
  }
  headers.set("Accept", "application/json");

  const rangeHeader = request.headers.get("Range");
  if (rangeHeader) {
    headers.set("Range", rangeHeader);
  }

  for (const [key, value] of Object.entries(extra)) {
    headers.set(key, value);
  }

  return headers;
}

function forwardSearchParams(source: URLSearchParams, target: URL, dropKeys: string[]): void {
  const drop = new Set(dropKeys);
  source.forEach((value, key) => {
    if (drop.has(key)) {
      return;
    }
    target.searchParams.set(key, value);
  });
}

async function proxyApiRequest(url: URL, request: Request): Promise<Response> {
  const types = url.searchParams.get("types");
  if (!types) {
    return jsonError(400, "missing_types");
  }

  const apiUrl = new URL(API_BASE_URL);
  forwardSearchParams(url.searchParams, apiUrl, ["target"]);

  const upstream = await fetch(apiUrl.toString(), {
    headers: buildUpstreamHeaders(request),
  }).catch(() => null);

  if (!upstream) {
    return jsonError(502, "upstream_unavailable");
  }

  const source = apiUrl.searchParams.get("source") || "";
  const headers = buildResponseHeaders(upstream.headers, types, source);

  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("retry-after") || "";
    headers.set("Cache-Control", "no-store");
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        retryAfter: retryAfter ? Number(retryAfter) || retryAfter : null,
      }),
      { status: 429, headers }
    );
  }

  if (upstream.status >= 500) {
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify({ error: "upstream_unavailable" }), {
      status: 502,
      headers,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

function matchAudioRule(hostname: string): { pattern: RegExp; referer: string } | null {
  if (!hostname) return null;
  for (const rule of AUDIO_HOST_RULES) {
    if (rule.pattern.test(hostname)) {
      return rule;
    }
  }
  return null;
}

function isAllowedAudioHost(hostname: string): boolean {
  return matchAudioRule(hostname) !== null;
}

function normalizeAudioUrl(rawUrl: string): { url: URL; referer: string } | null {
  try {
    const parsed = new URL(rawUrl);
    const rule = matchAudioRule(parsed.hostname);
    if (!rule) {
      return null;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.protocol = "http:";
    return { url: parsed, referer: rule.referer };
  } catch {
    return null;
  }
}

async function proxyAudioRequest(targetUrl: string, request: Request): Promise<Response> {
  const normalized = normalizeAudioUrl(targetUrl);
  if (!normalized) {
    return jsonError(400, "invalid_target");
  }

  const upstream = await fetch(normalized.url.toString(), {
    method: request.method,
    headers: buildUpstreamHeaders(request, {
      Referer: normalized.referer,
    }),
  }).catch(() => null);

  if (!upstream) {
    return jsonError(502, "upstream_unavailable");
  }

  const headers = new Headers();
  for (const key of SAFE_RESPONSE_HEADERS) {
    const value = upstream.headers.get(key);
    if (value != null) {
      headers.set(key, value);
    }
  }

  if (!headers.has("cache-control")) {
    headers.set("cache-control", "public, max-age=3600, s-maxage=86400");
  }
  if (!headers.has("content-type")) {
    const ct = upstream.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
  }

  headers.set("Access-Control-Allow-Origin", "*");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function onRequest(context: { request: Request }): Promise<Response> {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonError(405, "method_not_allowed");
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("target");

  try {
    if (target) {
      return await proxyAudioRequest(target, request);
    }
    return await proxyApiRequest(url, request);
  } catch {
    return jsonError(500, "internal_error");
  }
}
