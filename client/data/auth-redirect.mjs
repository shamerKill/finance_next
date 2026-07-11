export const DEFAULT_AUTH_DESTINATION = "/ai-money";

export function safeNextOrDefault(raw, fallback = DEFAULT_AUTH_DESTINATION) {
  const next = String(raw || "").trim();
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return fallback;
}

export function authHrefWithNext(pathname, rawNext) {
  const path = String(pathname || "/login").trim() || "/login";
  const next = safeNextOrDefault(rawNext, "");
  if (!next) return path;
  const qs = new URLSearchParams({ next });
  return `${path}?${qs.toString()}`;
}

export function authPageDestinationFromUrl(
  urlLike,
  fallback = DEFAULT_AUTH_DESTINATION,
) {
  const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike));
  return safeNextOrDefault(url.searchParams.get("next"), fallback);
}

export function protectedNextParamFromUrl(urlLike) {
  const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike));
  if (url.pathname === "/") return "";
  return `${url.pathname}${url.search}`;
}

export function loginHrefForUrl(urlLike) {
  return authHrefWithNext("/login", protectedNextParamFromUrl(urlLike));
}

export function loginHrefForPath(pathname, search = "") {
  const path = String(pathname || "").trim();
  const query = String(search || "").trim();
  const next = path === "/" ? "" : `${path}${query.startsWith("?") ? query : ""}`;
  return authHrefWithNext("/login", next);
}
