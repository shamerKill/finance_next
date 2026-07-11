import assert from "node:assert/strict";
import { test } from "node:test";

import { absoluteApiBaseUrl, apiBaseUrl, apiUrl } from "./api-base.mjs";

test("apiBaseUrl keeps browser public base relative for same-origin proxying", () => {
  assert.equal(apiBaseUrl({ NEXT_PUBLIC_API_URL: "/api" }, true), "/api");
  assert.equal(apiUrl("v1/auth/me", { NEXT_PUBLIC_API_URL: "/api" }, true), "/api/v1/auth/me");
});

test("apiBaseUrl does not fall back to localhost when browser bundle has a public base", () => {
  assert.equal(apiBaseUrl({ NEXT_PUBLIC_API_URL: "/api" }, true), "/api");
});

test("apiBaseUrl keeps empty browser public base on the same-origin proxy", () => {
  assert.equal(apiBaseUrl({ NEXT_PUBLIC_API_URL: "" }, true), "/api");
});

test("apiBaseUrl uses server override for server-side fetches", () => {
  assert.equal(
    apiBaseUrl(
      {
        NEXT_PUBLIC_API_URL: "/api",
        NEXT_SERVER_API_URL: "http://gateway:3001/api",
      },
      false,
    ),
    "http://gateway:3001/api",
  );
  assert.equal(
    apiUrl(
      "v1/auth/me",
      {
        NEXT_PUBLIC_API_URL: "/api",
        NEXT_SERVER_API_URL: "http://gateway:3001/api",
      },
      false,
    ),
    "http://gateway:3001/api/v1/auth/me",
  );
});

test("apiBaseUrl avoids relative URLs in server-side fetches", () => {
  assert.equal(apiBaseUrl({ NEXT_PUBLIC_API_URL: "/api" }, false), "http://localhost:3001/api");
});

test("absoluteApiBaseUrl resolves relative browser API base for WebSocket URL derivation", () => {
  assert.equal(
    absoluteApiBaseUrl({ NEXT_PUBLIC_API_URL: "/api" }, true, "http://localhost:18080"),
    "http://localhost:18080/api",
  );
});
