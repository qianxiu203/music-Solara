/**
 * 登录接口 — SHA-256 哈希会话 + 失败限流
 */

const MAX_FAILURES = 10;
const COOL_DOWN_MINUTES = 5;
const DEFAULT_MAX_AGE_HOURS = 48;

interface Env {
  PASSWORD?: string;
  AUTH_MAX_AGE_HOURS?: string;
}

interface FailureStore {
  count: number;
  firstFailure: number;
  lockedUntil: number;
}

// 每个 Workers isolate 独立维护（尽力而为；生产环境可替换为 D1/KV）
const failureStore = new Map<string, FailureStore>();

function getClientIp(request: Request): string {
  const xfwd = request.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0].trim();
  const cfConn = request.headers.get("cf-connecting-ip");
  if (cfConn) return cfConn.trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function getMaxAgeHours(env: Env): number {
  const raw = env?.AUTH_MAX_AGE_HOURS;
  if (!raw) return DEFAULT_MAX_AGE_HOURS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_AGE_HOURS;
  return Math.min(parsed, 8760);
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isCoolingDown(ip: string): boolean {
  const record = failureStore.get(ip);
  if (!record) return false;
  if (record.lockedUntil > Date.now()) return true;
  failureStore.delete(ip);
  return false;
}

function recordFailure(ip: string): number {
  const now = Date.now();
  let record = failureStore.get(ip);

  if (!record || now - record.firstFailure > COOL_DOWN_MINUTES * 60 * 1000) {
    record = { count: 1, firstFailure: now, lockedUntil: 0 };
    failureStore.set(ip, record);
    return 1;
  }

  record.count += 1;
  if (record.count >= MAX_FAILURES) {
    record.lockedUntil = now + COOL_DOWN_MINUTES * 60 * 1000;
    record.count = 0;
  }
  return record.count;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const passwordEnv = env.PASSWORD;
  const url = new URL(request.url);
  const clientIp = getClientIp(request);

  // 限流检查
  if (isCoolingDown(clientIp)) {
    const retryAfter = Math.ceil(
      ((failureStore.get(clientIp)?.lockedUntil || 0) - Date.now()) / 1000
    );
    return new Response(
      JSON.stringify({ success: false, error: "rate_limited", retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      }
    );
  }

  const body = await request.json().catch(() => ({ password: "" }));
  const providedPassword = typeof body.password === "string" ? body.password : "";

  // 未配置密码环境变量 = 免登录
  if (typeof passwordEnv !== "string" || passwordEnv.length === 0) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expectedHash = await hashPassword(passwordEnv);
  const providedHash = await hashPassword(providedPassword);

  if (providedHash === expectedHash) {
    failureStore.delete(clientIp);
    const maxAgeSeconds = getMaxAgeHours(env) * 60 * 60;
    const cookieSegments = [
      `auth=${expectedHash}`,
      `Max-Age=${maxAgeSeconds}`,
      "Path=/",
      "SameSite=Lax",
      "HttpOnly",
    ];
    if (url.protocol === "https:") {
      cookieSegments.push("Secure");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": cookieSegments.join("; "),
      },
    });
  }

  const remaining = MAX_FAILURES - recordFailure(clientIp) - 1;
  return new Response(
    JSON.stringify({ success: false, error: "invalid_password", remainingAttempts: Math.max(0, remaining) }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
}