import { localeFile, needsLocaleFile } from "../generators/localeRegistry";
import type { DatasetRow } from "./dataset";
import { AutofillSettings, ClearResult, FieldResult, FillResult, ReportFormat, ScriptFramework, UndoResult } from "./types";

/** Runs a command in a tab or frame this extension has been granted, through a click on the icon or its menus. */
async function sendToPage<T>(tabId: number, message: { type: string; settings?: AutofillSettings; value?: string; datasetRow?: DatasetRow; message?: string }, frameId?: number, loadLanguage = false): Promise<T> {
  const target = frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] };
  const send = (body: object): Promise<unknown> =>
    frameId === undefined ? chrome.tabs.sendMessage(tabId, body) : chrome.tabs.sendMessage(tabId, body, { frameId });
  await chrome.scripting.executeScript({ target, files: ["content.js"] });
  if (loadLanguage) {
    // Name data for most languages ships as its own file, loaded only for a page that needs it.
    const answer = await send({ type: "SMART_AUTOFILL_LANGUAGE", settings: message.settings }) as { country?: unknown } | undefined;
    if (needsLocaleFile(answer?.country)) await chrome.scripting.executeScript({ target, files: [localeFile(answer.country)] });
  }
  const response = await send(message) as T | undefined;
  if (!response) throw new Error("The page did not respond. Try reloading it.");
  return response;
}

export const fillTab = (tabId: number, settings: AutofillSettings, datasetRow?: DatasetRow): Promise<FillResult> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_FILL", settings, datasetRow }, undefined, true);

/** A short note on the page, for outcomes that never reach a fill, such as every dataset row being used. */
export const toastTab = (tabId: number, message: string): Promise<unknown> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_TOAST", message });

export const captureTab = async (tabId: number): Promise<Array<{ field: string; value: string }>> =>
  (await sendToPage<{ fields: Array<{ field: string; value: string }> }>(tabId, { type: "SMART_AUTOFILL_CAPTURE" })).fields;

/** Sent by the popup, and by tests, to fill from the dataset the way the right-click menu does. */
export const DATASET_FILL_MESSAGE = "SMART_AUTOFILL_DATASET_FILL";
export const DATASET_SAVE_MESSAGE = "SMART_AUTOFILL_DATASET_SAVE";

export const clearTab = (tabId: number, settings: AutofillSettings): Promise<ClearResult> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_CLEAR", settings });

/** Fills the field a menu was opened on. With no `value`, one is generated for that field. */
export const fillField = (tabId: number, frameId: number | undefined, settings: AutofillSettings, value?: string): Promise<FieldResult> =>
  sendToPage(tabId, { type: "SMART_AUTOFILL_FIELD", settings, value }, frameId, true);

/** Sent by the popup. The worker runs the fill, because a popup closes if the page takes focus. */
export const FILL_TAB_MESSAGE = "SMART_AUTOFILL_FILL_TAB";

export type FillOutcome = { result: FillResult } | { error: string };

/** Copies the last fill on that page. Nothing to copy when no fill has run since the page loaded. */
export async function copyFill(tabId: number, format: ReportFormat): Promise<boolean> {
  try {
    const answer = await chrome.tabs.sendMessage(tabId, { type: "SMART_AUTOFILL_COPY", format }) as { copied?: boolean } | undefined;
    return answer?.copied === true;
  } catch {
    // Nothing runs in the page until a fill, so there is nothing to copy; the page still hears why.
    await toastTab(tabId, NOTHING_FILLED).catch(() => undefined);
    return false;
  }
}

const NOTHING_FILLED = "Nothing to copy yet. Fill the form first.";

/** The last fill on that page as text, for the popup to copy. */
export async function fillReport(tabId: number, format: ReportFormat): Promise<{ text: string; count: number }> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "SMART_AUTOFILL_REPORT", format }) as { text: string; count: number } | undefined) ?? { text: "", count: 0 };
  } catch {
    return { text: "", count: 0 };
  }
}

export type ScriptOutput = "copy" | "text" | "file" | "data";

/** Copies or downloads the last fill as a test script, or returns it as text for the popup to copy. */
export async function scriptFill(tabId: number, framework: ScriptFramework, output: ScriptOutput, csv?: { name: string; text: string }): Promise<{ done: boolean; text?: string }> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "SMART_AUTOFILL_SCRIPT", framework, output, csv }) as { done: boolean; text?: string } | undefined) ?? { done: false };
  } catch {
    // Nothing runs in the page until a fill. The popup shows its own message, so only menus get the note.
    if (output !== "text") await toastTab(tabId, NOTHING_FILLED).catch(() => undefined);
    return { done: false };
  }
}

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
