import { AutofillSettings, FillResult } from "./types";

/** Runs a fill in a tab this extension has been granted, through a toolbar click. */
export async function fillTab(tabId: number, settings: AutofillSettings): Promise<FillResult> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const response = await chrome.tabs.sendMessage(tabId, { type: "SMART_AUTOFILL_FILL", settings }) as FillResult | undefined;
  if (!response) throw new Error("The page did not respond. Try reloading it.");
  return response;
}

export function fillErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not fill this page.";
  return /Cannot access|cannot be scripted/i.test(message) ? "Chrome does not allow extensions on this page." : message;
}
