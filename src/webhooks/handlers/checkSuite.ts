export function normalizeCheckSuiteEvent(payload: Record<string, any>) {
  if (payload.check_suite?.app?.slug === "trustsignal") {
    return null;
  }

  return null;
}
