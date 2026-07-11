import assert from "node:assert/strict";
import test from "node:test";

import {
  authPageDestinationFromUrl,
  authHrefWithNext,
  DEFAULT_AUTH_DESTINATION,
  loginHrefForPath,
  loginHrefForUrl,
  protectedNextParamFromUrl,
  safeNextOrDefault,
} from "./auth-redirect.mjs";

test("protectedNextParamFromUrl preserves strategy detail query params", () => {
  const next = protectedNextParamFromUrl(
    new URL("http://localhost:3000/strategies/fake?from=ai-draft"),
  );

  assert.equal(next, "/strategies/fake?from=ai-draft");
});

test("protectedNextParamFromUrl preserves AI option prefill params", () => {
  const next = protectedNextParamFromUrl(
    new URL("http://localhost:3000/option?source=ai-goal&name=btca"),
  );

  assert.equal(next, "/option?source=ai-goal&name=btca");
});

test("protectedNextParamFromUrl omits root next params", () => {
  assert.equal(protectedNextParamFromUrl(new URL("http://localhost:3000/")), "");
});

test("safeNextOrDefault preserves safe AI Money destinations", () => {
  assert.equal(safeNextOrDefault("/ai-money"), "/ai-money");
  assert.equal(
    safeNextOrDefault("/ai-money?intent=rerun_ai"),
    "/ai-money?intent=rerun_ai",
  );
});

test("safeNextOrDefault rejects unsafe destinations", () => {
  assert.equal(safeNextOrDefault("https://evil.example/ai-money"), "/ai-money");
  assert.equal(safeNextOrDefault("//evil.example/ai-money"), "/ai-money");
  assert.equal(safeNextOrDefault(""), "/ai-money");
});

test("safeNextOrDefault supports explicit fallback overrides", () => {
  assert.equal(DEFAULT_AUTH_DESTINATION, "/ai-money");
  assert.equal(
    safeNextOrDefault("https://evil.example/ai-money", "/dashboard"),
    "/dashboard",
  );
});

test("authHrefWithNext carries safe AI Money next params across auth pages", () => {
  assert.equal(
    authHrefWithNext("/register", "/ai-money"),
    "/register?next=%2Fai-money",
  );
  assert.equal(
    authHrefWithNext("/accept-invite", "/ai-money?intent=rerun_ai"),
    "/accept-invite?next=%2Fai-money%3Fintent%3Drerun_ai",
  );
});

test("authHrefWithNext omits unsafe next params", () => {
  assert.equal(authHrefWithNext("/register", "https://evil.example"), "/register");
  assert.equal(authHrefWithNext("/login", "//evil.example"), "/login");
  assert.equal(authHrefWithNext("/login", ""), "/login");
});

test("authPageDestinationFromUrl returns safe next for authenticated auth pages", () => {
  assert.equal(
    authPageDestinationFromUrl(
      new URL("http://localhost:3000/login?next=%2Fai-money"),
    ),
    "/ai-money",
  );
  assert.equal(
    authPageDestinationFromUrl(
      new URL("http://localhost:3000/login?next=%2Fai-money%3FrunId%3Dgoal_1"),
    ),
    "/ai-money?runId=goal_1",
  );
});

test("authPageDestinationFromUrl rejects unsafe next values", () => {
  assert.equal(
    authPageDestinationFromUrl(
      new URL("http://localhost:3000/login?next=https%3A%2F%2Fevil.example"),
    ),
    "/ai-money",
  );
  assert.equal(
    authPageDestinationFromUrl(
      new URL("http://localhost:3000/login?next=%2F%2Fevil.example"),
    ),
    "/ai-money",
  );
});

test("authPageDestinationFromUrl supports explicit fallback overrides", () => {
  assert.equal(
    authPageDestinationFromUrl(
      new URL("http://localhost:3000/login?next=%2F%2Fevil.example"),
      "/dashboard",
    ),
    "/dashboard",
  );
});

test("loginHrefForUrl carries current AI Money page as next", () => {
  assert.equal(
    loginHrefForUrl("http://localhost:3000/ai-money?runId=goal_1"),
    "/login?next=%2Fai-money%3FrunId%3Dgoal_1",
  );
});

test("loginHrefForUrl omits root next params", () => {
  assert.equal(loginHrefForUrl("http://localhost:3000/"), "/login");
});

test("loginHrefForPath carries settings pages as next", () => {
  assert.equal(
    loginHrefForPath("/settings/ai", "?section=model"),
    "/login?next=%2Fsettings%2Fai%3Fsection%3Dmodel",
  );
});

test("loginHrefForPath omits root next params", () => {
  assert.equal(loginHrefForPath("/", ""), "/login");
});
