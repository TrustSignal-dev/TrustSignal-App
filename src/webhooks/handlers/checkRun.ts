export function normalizeCheckRunEvent(payload: Record<string, any>, appName: string) {
  const checkRun = payload.check_run;
  if (!checkRun) {
    return null;
  }

  if (checkRun.name === "TrustSignal Verification") {
    return null;
  }

  if (checkRun.app?.name === appName || checkRun.app?.slug === appName.toLowerCase()) {
    return null;
  }

  return null;
}
