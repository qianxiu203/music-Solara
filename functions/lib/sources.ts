/**
 * Solara 源清单 — 唯一权威来源（Single Source of Truth）
 *
 * 内置音源、上游 API 白名单、音频代理域名规则均在此维护。
 * 服务端环境变量可覆盖默认值。
 */

// ── 内置音源 ────────────────────────────────────────────────
export interface SourceEntry {
  value: string;
  label: string;
  stable: boolean;
  note?: string;
}

export const BUILT_IN_SOURCES: SourceEntry[] = [
  { value: "netease", label: "网易云音乐", stable: true },
  { value: "kuwo", label: "酷我音乐", stable: false, note: "GD Studio 当前可能不稳定" },
  { value: "joox", label: "JOOX音乐", stable: true },
  { value: "bilibili", label: "哔哩哔哩", stable: true },
];

// ── 默认 GD Studio ──────────────────────────────────────────
export const DEFAULT_API_BASE = "https://music-api.gdstudio.xyz/api.php";

// ── 音频代理域名规则 ─────────────────────────────────────────
export interface AudioHostRule {
  pattern: RegExp;
  referer: string;
}
export const AUDIO_HOST_RULES: AudioHostRule[] = [
  { pattern: /(^|\.)kuwo\.cn$/i, referer: "https://www.kuwo.cn/" },
  { pattern: /(^|\.)bilivideo\.com$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)bilibili\.com$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)hdslb\.com$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)akamaized\.net$/i, referer: "https://www.bilibili.com/" },
  { pattern: /(^|\.)joox\.com$/i, referer: "https://www.joox.com/" },
];

// ── 稳定源集合（用于缓存区分） ───────────────────────────────
export const STABLE_SOURCES = new Set<string>(
  BUILT_IN_SOURCES.filter((s) => s.stable).map((s) => s.value)
);

// ── 可选追加音频规则（JSON 数组） ────────────────────────────
export function appendHostRules(env: { AUDIO_HOST_RULES_JSON?: string }): AudioHostRule[] {
  const extraRaw = env?.AUDIO_HOST_RULES_JSON;
  if (!extraRaw || typeof extraRaw !== "string") return AUDIO_HOST_RULES;
  try {
    const extra = JSON.parse(extraRaw) as Array<{ pattern: string; referer: string }>;
    if (!Array.isArray(extra)) return AUDIO_HOST_RULES;
    return [...AUDIO_HOST_RULES, ...extra.map((item) => ({ ...item, pattern: new RegExp(item.pattern) }))];
  } catch {
    return AUDIO_HOST_RULES;
  }
}

// ── 上游 API 白名单 ──────────────────────────────────────────
export interface ApiBaseEntry {
  url: string;
  label?: string;
}

function parseApiBases(raw: string | undefined): ApiBaseEntry[] {
  if (!raw || typeof raw !== "string") return [{ url: DEFAULT_API_BASE }];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((url) => ({ url }));
}

export function getApiBases(env: { MUSIC_API_BASES?: string }): ApiBaseEntry[] {
  return parseApiBases(env?.MUSIC_API_BASES);
}

export function getDefaultApiBase(env: { MUSIC_API_BASES?: string }): string {
  const bases = getApiBases(env);
  return (bases[0]?.url || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export function resolveUpstream(
  apiQuery: string | null,
  apiBases: ApiBaseEntry[]
): { api: string; base: ApiBaseEntry } | { error: string } {
  if (!apiQuery) return { api: apiBases[0]?.url || DEFAULT_API_BASE, base: apiBases[0]! };
  const decoded = decodeURIComponent(apiQuery.trim());
  const match = apiBases.find((b) => b.url === decoded);
  if (!match) return { error: "api_not_allowed" };
  return { api: match.url, base: match };
}

// ── 认证会话时长 ─────────────────────────────────────────────
export function getAuthMaxAgeHours(env: { AUTH_MAX_AGE_HOURS?: string }): number {
  const raw = env?.AUTH_MAX_AGE_HOURS;
  if (!raw) return 48;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 48;
  return Math.min(parsed, 8760); // 上限 1 年
}