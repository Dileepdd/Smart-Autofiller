export interface Signal {
  text: string;
  weight: number;
}

const WEIGHT = { label: 60, name: 50, hint: 40, nearby: 30, surrounding: 15 };

const NAME_ATTRIBUTES = ["name", "id", "formcontrolname", "data-field", "data-name", "data-testid", "data-test", "data-cy", "data-qa"];
const LABEL_ATTRIBUTES = ["aria-label"];
const HINT_ATTRIBUTES = ["placeholder", "title"];

const OTHER_FIELDS = "input:not([type=hidden]), textarea, select";
const NON_TEXT_PARENTS = "select, option, textarea, script, style, noscript";
const MAX_SURROUNDING_LENGTH = 180;
const MAX_ANCESTORS = 4;

/** Normalises fullName, full_name, FullName, full-name and "Full Name *" to "full name". */
export const splitWords = (value: string): string =>
  value
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/(\p{L})(\p{N})/gu, "$1 $2")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();

/** Visible-ish text of a node, leaving out dropdown options and other control contents. */
function textOf(node: Node): string {
  const walker = node.ownerDocument?.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const pieces: string[] = [];
  while (walker?.nextNode()) {
    const text = walker.currentNode;
    if (!text.parentElement?.closest(NON_TEXT_PARENTS)) pieces.push(text.nodeValue ?? "");
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

const queryRoot = (element: Element): Document | ShadowRoot => element.getRootNode() as Document | ShadowRoot;

function labelTexts(element: HTMLElement): string[] {
  const root = queryRoot(element);
  const labels: Element[] = [];
  if (element.id) labels.push(...Array.from(root.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`)));
  const wrapping = element.closest("label");
  if (wrapping) labels.push(wrapping);
  for (const id of (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) {
    const node = root.querySelector(`#${CSS.escape(id)}`);
    if (node) labels.push(node);
  }
  return labels.map(textOf);
}

/** A label beside the field that names no real field, as in `<label for="text">` repeated across a form. */
function orphanLabelTexts(element: HTMLElement): string[] {
  let node = element.parentElement;
  for (let depth = 0; node && node.tagName !== "BODY" && depth < MAX_ANCESTORS && !holdsAnotherField(node, element); depth++) {
    const label = node.querySelector<HTMLLabelElement>("label");
    if (label) return label.control ? [] : [textOf(label)];
    node = node.parentElement;
  }
  return [];
}

function describedByTexts(element: HTMLElement): string[] {
  const root = queryRoot(element);
  return (element.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).flatMap((id) => {
    const node = root.querySelector(`#${CSS.escape(id)}`);
    return node ? [textOf(node)] : [];
  });
}

const holdsAnotherField = (node: Element, field: HTMLElement): boolean =>
  (node.matches(OTHER_FIELDS) && node !== field) ||
  Array.from(node.querySelectorAll(OTHER_FIELDS)).some((other) => other !== field && !field.contains(other));

/** Text directly before the field, for forms written as `Age <input><br>Email <input>`. */
function precedingText(element: HTMLElement): string {
  for (let node = element.previousSibling; node; node = node.previousSibling) {
    if (node instanceof Element) {
      if (holdsAnotherField(node, element)) return "";
      if (node.tagName === "LABEL" && node.getAttribute("for")) return "";
    }
    const text = textOf(node) || (node.nodeType === Node.TEXT_NODE ? (node.nodeValue ?? "").trim() : "");
    if (text) return text.length < MAX_SURROUNDING_LENGTH ? text : "";
  }
  return "";
}

/** Text of the nearest ancestor that belongs to this field alone; a shared parent would leak other labels. */
function surroundingText(element: HTMLElement): string {
  let node = element.parentElement;
  for (let depth = 0; node && node.tagName !== "BODY" && depth < MAX_ANCESTORS; depth++) {
    if (holdsAnotherField(node, element)) return "";
    const text = textOf(node);
    if (text) return text.length < MAX_SURROUNDING_LENGTH ? text : "";
    node = node.parentElement;
  }
  return "";
}

const FORMAT_HINT = /\b(?:format|pattern|e\.?g\.?|example|ex)\b\s*[:.-]?\s*([a-z0-9#]+(?:[-/. ][a-z0-9#]+)+)/i;
const BARE_MASK = /^[x#9]+(?:[-/. ][x#9]+)+$/i;

function hintedFormat(text: string): string | undefined {
  const trimmed = text.trim();
  return BARE_MASK.test(trimmed) ? trimmed : FORMAT_HINT.exec(trimmed)?.[1];
}

/** A format the page spells out for this field, such as "Format: XX-XXXXXXX" under it. */
export function formatHint(element: HTMLElement): string | undefined {
  const texts = [element.getAttribute("placeholder") ?? "", element.getAttribute("title") ?? "", ...describedByTexts(element)];
  let node = element.parentElement;
  for (let depth = 0; node && node.tagName !== "BODY" && depth < MAX_ANCESTORS && !holdsAnotherField(node, element); depth++) {
    texts.push(textOf(node));
    node = node.parentElement;
  }
  return texts.map(hintedFormat).find(Boolean);
}

const REQUIRED_MARK = /\*\s*$|\(required\)/i;

function inRequiredGroup(element: HTMLElement): boolean {
  const name = element.getAttribute("name");
  if (element.getAttribute("type") !== "radio" || !name) return false;
  return queryRoot(element).querySelector(`input[type=radio][name="${CSS.escape(name)}"][required]`) !== null;
}

/** Many forms only mark a required field with an asterisk in its label, so that counts too. */
export function isRequired(element: HTMLElement): boolean {
  if (element.hasAttribute("required") || element.getAttribute("aria-required") === "true" || inRequiredGroup(element)) return true;
  const label = element.getAttribute("aria-label") ?? "";
  return [...labelTexts(element), label, precedingText(element)].some((text) => REQUIRED_MARK.test(text));
}

/** The text a person sees for a radio button or similar choice. */
export const choiceLabel = (element: HTMLElement): string => labelTexts(element).join(" ").trim();

/** Everything known about a field, each piece weighted by how directly it describes that field. */
export function fieldSignals(element: HTMLElement): Signal[] {
  const attributes = (names: string[]): string[] => names.flatMap((name) => element.getAttribute(name) ?? []);
  const signals = (texts: string[], weight: number): Signal[] =>
    texts.map(splitWords).filter(Boolean).map((text) => ({ text, weight }));

  const labels = labelTexts(element);
  // Only a field with no label of its own needs one borrowed from beside it.
  const borrowed = labels.length ? [] : orphanLabelTexts(element);
  return [
    ...signals([...labels, ...attributes(LABEL_ATTRIBUTES), ...borrowed], WEIGHT.label),
    ...signals(attributes(NAME_ATTRIBUTES), WEIGHT.name),
    ...signals(attributes(HINT_ATTRIBUTES), WEIGHT.hint),
    ...signals([precedingText(element)], WEIGHT.nearby),
    ...signals([...describedByTexts(element), surroundingText(element)], WEIGHT.surrounding)
  ];
}
