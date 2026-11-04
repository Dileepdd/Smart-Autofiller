import { fillPage } from "./filler";
import { DEFAULT_SETTINGS, AutofillSettings } from "../shared/types";

const runtime = globalThis as typeof globalThis & { __smartAutofillListenerInstalled?: boolean };

if (!runtime.__smartAutofillListenerInstalled) {
  runtime.__smartAutofillListenerInstalled = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SMART_AUTOFILL_FILL") return;
    const settings = { ...DEFAULT_SETTINGS, ...(message.settings as Partial<AutofillSettings> | undefined) };
    fillPage(settings).then(sendResponse).catch((error: unknown) => {
      sendResponse({ filled: 0, skipped: 0, errors: 1, details: [String(error)] });
    });
    return true;
  });
}
