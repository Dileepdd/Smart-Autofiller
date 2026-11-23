import { clearPage } from "./clear";
import { fillFocusedField } from "./field";
import { fillPage } from "./filler";
import { dataCountry, withDataLanguage } from "./pageLanguage";
import { captureForm } from "./capture";
import { handleScript } from "./script/deliver";
import { copyText, formatReport, lastFill } from "./report";
import { filledMessage, showToast } from "./toast";
import { undoLastFill } from "./undo";
import { DEFAULT_SETTINGS, AutofillSettings, FillResult } from "../shared/types";

const runtime = globalThis as typeof globalThis & { __smartAutofillListenerInstalled?: boolean };

const failure = (detail: string): FillResult => ({ filled: 0, skipped: 0, errors: 1, unsupported: 0, details: [detail] });

const settingsFrom = (message: { settings?: Partial<AutofillSettings> }): AutofillSettings => ({ ...DEFAULT_SETTINGS, ...message.settings });

/** Settings with names and addresses for the country this page calls for. */
const pageSettings = (message: { settings?: Partial<AutofillSettings> }): AutofillSettings => withDataLanguage(settingsFrom(message), document);

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
    if (message?.type === "SMART_AUTOFILL_TOAST") {
      showToast(String(message.message ?? ""));
      sendResponse({ shown: true });
      return;
    }
    if (message?.type === "SMART_AUTOFILL_CAPTURE") {
      sendResponse({ fields: captureForm(document) });
      return;
    }
    if (message?.type === "SMART_AUTOFILL_SCRIPT") {
      void handleScript(message).then(sendResponse);
      return true;
    }
    if (message?.type === "SMART_AUTOFILL_REPORT") {
      const report = lastFill();
      sendResponse(report ? { text: formatReport(report, message.format), count: report.fields.length } : { text: "", count: 0 });
      return;
    }
    if (message?.type === "SMART_AUTOFILL_COPY") {
      const report = lastFill();
      if (!report) {
        showToast("Nothing to copy yet. Fill the form first.");
        sendResponse({ copied: false });
        return;
      }
      void copyText(formatReport(report, message.format)).then((copied) => {
        showToast(copied ? `Copied ${report.fields.length} fields for a bug report` : "Could not copy. Try the popup's Copy button.");
        sendResponse({ copied });
      });
      return true;
    }
    if (message?.type === "SMART_AUTOFILL_LANGUAGE") {
      sendResponse({ country: dataCountry(settingsFrom(message), document) });
      return;
    }
    if (message?.type === "SMART_AUTOFILL_FIELD") {
      sendResponse(fillFocusedField(pageSettings(message), message.value));
      return;
    }
    if (message?.type !== "SMART_AUTOFILL_FILL") return;
    if (filling) {
      sendResponse(failure("A fill is already running on this page."));
      return;
    }
    filling = true;
    fillPage(pageSettings(message), message.datasetRow)
      .then((result) => {
        const row = result.datasetRow ? `Row ${result.datasetRow.number} of ${result.datasetRow.total} · ` : "";
        showToast(`${row}${filledMessage(result.filled)}`);
        sendResponse(result);
      })
      .catch((error: unknown) => sendResponse(failure(String(error))))
      .finally(() => { filling = false; });
    return true;
  });
}
