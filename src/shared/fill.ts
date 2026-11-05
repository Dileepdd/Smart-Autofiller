import { AutofillSettings, ClearResult, FieldResult, FillResult, UndoResult } from "./types";

/** Runs a command in a tab or frame this extension has been granted, through a click on the icon or its menus. */
async function sendToPage<T>(tabId: number, message: object, frameId?: number): Promise<T> {
  const target = frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] };
  await chrome.scripting.executeScript({ target, files: ["content.js"] });
  const sent = frameId === undefined ? chrome.tabs.sendMessage(tabId, message) : chrome.tabs.sendMessage(tabId, message, { frameId });
  const response = await sent as T | undefined;
  if (!response) throw new Error("The page did not respond. Try reloading it.");
  return response;
}

export const fillTab = (tabId: number, settings: AutofillSettings): Promise<FillResult> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_FILL", settings });

export const clearTab = (tabId: number, settings: AutofillSettings): Promise<ClearResult> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_CLEAR", settings });

/** Fills the field a menu was opened on. With no `value`, one is generated for that field. */
export const fillField = (tabId: number, frameId: number | undefined, settings: AutofillSettings, value?: string): Promise<FieldResult> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_FIELD", settings, value }, frameId);

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

export const clearMessage = ({ cleared, notCleared }: ClearResult): string => {
  if (!cleared && !notCleared) return "Nothing to clear on this page.";
  return notCleared ? `Cleared ${cleared} fields. ${notCleared} could not be cleared.` : `Cleared ${cleared} fields.`;
};

export function fillErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Could not fill this page.";
  return /Cannot access|cannot be scripted/i.test(message) ? "Chrome does not allow extensions on this page." : message;
}
