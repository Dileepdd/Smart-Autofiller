import { AutofillSettings, FillResult, UndoResult } from "./types";

/** Runs a fill in a tab this extension has been granted, through a toolbar click. */
export async function fillTab(tabId: number, settings: AutofillSettings): Promise<FillResult> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const response = await chrome.tabs.sendMessage(tabId, { type: "SMART_AUTOFILL_FILL", settings }) as FillResult | undefined;
  if (!response) throw new Error("The page did not respond. Try reloading it.");
  return response;
}

/** Sent by the popup. The worker runs the fill, because a popup closes if the page takes focus. */
export const FILL_TAB_MESSAGE = "SMART_AUTOFILL_FILL_TAB";

export type FillOutcome = { result: FillResult } | { error: string };

/** Asks the tab to restore the values from before its last fill. */
export async function undoFill(tabId: number): Promise<UndoResult> {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "SMART_AUTOFILL_UNDO" }) as UndoResult;
  } catch {
    // Nothing is listening, so this page has not been filled since it loaded.
    return { restored: 0, notRestored: 0 };
  }
}

export const undoMessage = ({ restored, notRestored }: UndoResult): string => {
  if (!restored && !notRestored) return "Nothing to undo on this page.";
  return notRestored ? `Restored ${restored} fields. ${notRestored} could not be restored.` : `Restored ${restored} fields.`;
};

export function fillErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not fill this page.";
  return /Cannot access|cannot be scripted/i.test(message) ? "Chrome does not allow extensions on this page." : message;
}
