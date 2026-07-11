export function shouldDispatchAuthUnauthorizedEvent(status) {
  return Number(status) === 401;
}

export function shouldShowAdminReloginHint(status) {
  return shouldDispatchAuthUnauthorizedEvent(status);
}
