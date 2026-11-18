import { isVisible } from "./detector";
import { delay } from "./waiting";

/** Pages usually show their error a moment after a field changes or loses focus. */
const SETTLE_MS = 300;
const MAX_ANCESTORS = 3;
const MAX_MESSAGE_LENGTH = 120;
const OTHER_FIELDS = "input:not([type=hidden]), textarea, select, [role=combobox]";
/** Where pages put an error message. Helper text such as "Format: XX-XXX" is left out on purpose. */
const ERROR_TEXT = "[role=alert], [aria-live=assertive], [class*=error], [class*=invalid], .text-danger";

const clean = (text: string | null | undefined): string => (text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);

/** Text the field itself points to with aria-errormessage or aria-describedby. */
function referencedMessage(element: HTMLElement): string {
  const root = element.getRootNode() as Document | ShadowRoot;
  const ids = `${element.getAttribute("aria-errormessage") ?? ""} ${element.getAttribute("aria-describedby") ?? ""}`.split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const node = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (node && node.matches(ERROR_TEXT) && isVisible(node)) return clean(node.textContent);
  }
  return "";
}

const holdsAnotherField = (node: Element, field: HTMLElement): boolean =>
  Array.from(node.querySelectorAll(OTHER_FIELDS)).some((other) => other !== field && !field.contains(other) && !other.contains(field));

/** An error shown beside the field, in the nearest container that belongs to this field alone. */
function nearbyMessage(element: HTMLElement): string {
  let node = element.parentElement;
  for (let depth = 0; node && node.tagName !== "BODY" && depth < MAX_ANCESTORS && !holdsAnotherField(node, element); depth++) {
    const errors = Array.from(node.querySelectorAll<HTMLElement>(ERROR_TEXT)).filter((error) => !error.contains(element) && isVisible(error));
    const text = errors.map((error) => clean(error.textContent)).find(Boolean);
    if (text) return text;
    node = node.parentElement;
  }
  return "";
}

/** Why the page will not accept this field's value, or nothing when it looks fine. */
export function invalidReason(element: HTMLElement): string | undefined {
  if (!element.isConnected) return undefined;
  const field = element as HTMLInputElement;
  const native = field.validity !== undefined && !field.validity.valid;
  const marked = element.getAttribute("aria-invalid") === "true";
  const message = referencedMessage(element) || nearbyMessage(element);
  if (!native && !marked && !message) return undefined;
  // A page's message could quote what was typed, and a password must never reach a report.
  if (field.type === "password") return "Rejected by the page";
  return message || clean(field.validationMessage) || "Marked invalid by the page";
}

/** Lists each filled field the page rejected, with its message. Nothing is submitted to find out. */
export async function validationReport(fields: HTMLElement[], describe: (element: HTMLElement) => string): Promise<string[]> {
  await delay(SETTLE_MS);
  return fields.flatMap((element) => {
    const reason = invalidReason(element);
    return reason ? [`Invalid: ${describe(element)} – ${reason}`] : [];
  });
}
