"use client";

import { useEffect, useState } from "react";

import { loginHrefForUrl } from "./auth-redirect.mjs";

export function useLoginHref() {
  const [href, setHref] = useState("/login");

  useEffect(() => {
    // Sync browser location into href after mount; server render has no window.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHref(loginHrefForUrl(window.location.href));
  }, []);

  return href;
}
