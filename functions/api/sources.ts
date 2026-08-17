import {
  BUILT_IN_SOURCES,
  getApiBases,
  appendHostRules,
  type ApiBaseEntry,
  type AudioHostRule,
} from "../lib/sources.js";

interface Env {
  MUSIC_API_BASES?: string;
  AUDIO_HOST_RULES_JSON?: string;
}

interface SourcesResponseBody {
  sources: typeof BUILT_IN_SOURCES;
  apiBases: ApiBaseEntry[];
  audioProxyHosts: string[];
}

function json(body: SourcesResponseBody, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function onRequestGet(context: { request: Request; env: Env }): Promise<Response> {
  const apiBases = getApiBases(context.env);
  const rules: AudioHostRule[] = appendHostRules(context.env);
  const hosts = Array.from(new Set(rules.map((r) => r.pattern.source.replace(/[\\^$.*+?()[\]{}|]/g, ""))));

  return json(
    {
      sources: BUILT_IN_SOURCES,
      apiBases,
      audioProxyHosts: rules.map((r) => r.pattern.source),
    },
    60
  );
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
  }
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  return onRequestGet(context);
}