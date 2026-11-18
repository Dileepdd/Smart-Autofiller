import { clearPage } from "./clear";
import { fillFocusedField } from "./field";
import { fillPage } from "./filler";
import { filledMessage, showToast } from "./toast";
import { undoLastFill } from "./undo";
import { DEFAULT_SETTINGS, AutofillSettings, FillResult } from "../shared/types";

const runtime = globalThis as typeof globalThis & { __smartAutofillListenerInstalled?: boolean };

const failure = (detail: string): FillResult => ({ filled: 0, skipped: 0, errors: 1, unsupported: 0, details: [detail] });

const settingsFrom = (message: { settings?: Partial<AutofillSettings> }): AutofillSettings => ({ ...DEFAULT_SETTINGS, ...message.settings });

if (!runtime.__smartAutofillListenerInstalled) {
  runtime.__smartAutofillListenerInstalled = true;
  let filling = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SMART_AUTOFILL_UNDO") {
      sendResponse(undoLastFill());
      return;
    }
    if (message?.type === "SMART_AUTOFILL_CLEAR") {
      sendResponse(clearPage(settingsFrom(message)));
      return;
    }
    if (message?.type === "SMART_AUTOFILL_FIELD") {
      sendResponse(fillFocusedField(settingsFrom(message), message.value));
      return;
    }
    if (message?.type !== "SMART_AUTOFILL_FILL") return;
    if (filling) {
      sendResponse(failure("A fill is already running on this page."));
      return;
    }
    filling = true;
    fillPage(settingsFrom(message))
      .then((result) => {
        showToast(filledMessage(result.filled));
        sendResponse(result);
      })
      .catch((error: unknown) => sendResponse(failure(String(error))))
      .finally(() => { filling = false; });
    return true;
  });
}
