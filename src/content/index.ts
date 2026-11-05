import { fillPage } from "./filler";
import { undoLastFill } from "./undo";
import { DEFAULT_SETTINGS, AutofillSettings, FillResult } from "../shared/types";

const runtime = globalThis as typeof globalThis & { __smartAutofillListenerInstalled?: boolean };

const failure = (detail: string): FillResult => ({ filled: 0, skipped: 0, errors: 1, unsupported: 0, details: [detail] });

if (!runtime.__smartAutofillListenerInstalled) {
  runtime.__smartAutofillListenerInstalled = true;
  let filling = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SMART_AUTOFILL_UNDO") {
      sendResponse(undoLastFill());
      return;
    }
    if (message?.type !== "SMART_AUTOFILL_FILL") return;
    if (filling) {
      sendResponse(failure("A fill is already running on this page."));
      return;
    }
    filling = true;
    const settings = { ...DEFAULT_SETTINGS, ...(message.settings as Partial<AutofillSettings> | undefined) };
    fillPage(settings)
      .then(sendResponse)
      .catch((error: unknown) => sendResponse(failure(String(error))))
      .finally(() => { filling = false; });
    return true;
  });
}
