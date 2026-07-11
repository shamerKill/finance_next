import assert from "node:assert/strict";
import test from "node:test";

import {
  shouldDispatchAuthUnauthorizedEvent,
  shouldShowAdminReloginHint,
} from "./api-auth-event.mjs";

test("shouldDispatchAuthUnauthorizedEvent dispatches for missing or expired sessions", () => {
  assert.equal(shouldDispatchAuthUnauthorizedEvent(401), true);
});

test("shouldDispatchAuthUnauthorizedEvent keeps permission denials inline", () => {
  assert.equal(shouldDispatchAuthUnauthorizedEvent(403), false);
  assert.equal(shouldDispatchAuthUnauthorizedEvent(404), false);
  assert.equal(shouldDispatchAuthUnauthorizedEvent(500), false);
});

test("shouldShowAdminReloginHint only shows for session failures", () => {
  assert.equal(shouldShowAdminReloginHint(401), true);
  assert.equal(shouldShowAdminReloginHint(403), false);
  assert.equal(shouldShowAdminReloginHint(500), false);
});
