const DEFAULT_BROWSER_API_URL = "/api";
const DEFAULT_SERVER_API_URL = "http://localhost:3001/api";
const BUNDLED_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_BROWSER_API_URL;

function isAbsoluteHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ""));
}

export function apiBaseUrl(env, isBrowser = typeof window !== "undefined") {
  const publicBase =
    env && Object.prototype.hasOwnProperty.call(env, "NEXT_PUBLIC_API_URL")
      ? env.NEXT_PUBLIC_API_URL || BUNDLED_PUBLIC_API_URL
      : BUNDLED_PUBLIC_API_URL;

  if (!isBrowser) {
    const runtimeEnv = env || process.env;
    const serverBase = runtimeEnv.NEXT_SERVER_API_URL || runtimeEnv.NEXT_INTERNAL_API_URL || "";
    if (serverBase) return serverBase;
    if (isAbsoluteHttpUrl(publicBase)) return publicBase;
    return DEFAULT_SERVER_API_URL;
  }

  return publicBase;
}

export function apiUrl(path, env, isBrowser = typeof window !== "undefined") {
  return apiBaseUrl(env, isBrowser) + `/${String(path)}`.replace("//", "/");
}

export function absoluteApiBaseUrl(
  env,
  isBrowser = typeof window !== "undefined",
  origin = isBrowser && typeof window !== "undefined" ? window.location.origin : "",
) {
  const base = apiBaseUrl(env, isBrowser);
  if (isAbsoluteHttpUrl(base)) return base;
  if (origin) return new URL(base, origin).toString().replace(/\/$/, "");
  return DEFAULT_SERVER_API_URL;
}
