// "Don't show again" for the How to play dialog, per browser (design D14). Separate from the
// player identifier and never sent to the API. If storage fails, the dialog keeps opening.
const STORAGE_KEY = "btc-up-down.hideInstructions";

export function readHideInstructions(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeHideInstructions(hide: boolean): void {
  try {
    if (hide) localStorage.setItem(STORAGE_KEY, "true");
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered; the dialog opens again on the next load, which is the safe default.
  }
}
