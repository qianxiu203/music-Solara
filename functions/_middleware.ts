import { hashPassword } from "./api/login.js";

const PUBLIC_PATH_PATTERNS = [/^\/login(?:\/|$)/, /^\/api\/login(?:\/|$)/];
const PUBLIC_FILE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".png",
  ".svg",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".txt",
  ".map",
  ".json",
  ".woff",
  ".woff2",
]);

function hasPublicExtension(pathname: string): boolean {
  const lastDotIndex = pathname.lastIndexOf(".");
  if (lastDotIndex === -1) return false;
  const extension = pathname.slice(lastDotIndex).toLowerCase();
  return PUBLIC_FILE_EXTENSIONS.has(extension);
}

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATH_PATTERNS.some((pattern) => pattern.test(pathname)) ||
    hasPublicExtension(pathname)
  );
}

async function authMiddleware(context: any): Promise<Response> {
  const { request, env } = context;
  const passwordEnv = env.PASSWORD;

  // 未配置密码 = 免登录
  if (typeof passwordEnv !== "string" || passwordEnv.length === 0) {
    return context.next();
  }

  if (isPublicPath(new URL(request.url).pathname)) {
    return context.next();
  }

  const expectedHash = await hashPassword(passwordEnv);
  const cookieHeader = request.headers.get("Cookie") || "";
  const cookies: Record<string, string> = {};

  cookieHeader.split(";").forEach((part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) return;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) cookies[key] = value;
  });

  if (cookies.auth && cookies.auth === expectedHash) {
    return context.next();
  }

  const loginUrl = new URL("/login", request.url);
  return Response.redirect(loginUrl.toString(), 302);
}

async function i18nMiddleware(context: any): Promise<Response> {
  const { env, next } = context;
  const response = await next();
  const language = env.language || env.LANGUAGE;

  if (language === "ENG" && response.headers.get("content-type")?.includes("text/html")) {
    return new HTMLRewriter().on("head", {
      element(element: any) {
        element.prepend(`<script>window.SITE_LANGUAGE = "ENG";</script>`, { html: true });
      },
    }).transform(response);
  }

  return response;
}

export const onRequest = [authMiddleware, i18nMiddleware];