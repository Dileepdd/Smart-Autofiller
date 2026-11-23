import { FieldLocator } from "../../shared/script/types";

const TEST_ATTRIBUTES = ["data-testid", "data-test", "data-cy", "data-qa", "data-test-id"];
const CONTROLS = "input, select, textarea, [role=combobox], [contenteditable]";
const MAX_PATH_DEPTH = 4;

/**
 * Ids a framework generates on each render, which a test cannot rely on: React's ":r1:", "mui-123",
 * "radix-…", "headlessui-…", Element UI's "el-id-…", or long runs of digits and random letters.
 */
const GENERATED_ID = /^:|^(mui|radix|headlessui|react-select|rc_select|el-id|downshift|ember|ext-gen)[-_:]|\d{4,}|[a-f0-9]{8,}|[A-Za-z0-9]{20,}/i;

const tidy = (text: string): string => text.replace(/\s*\*\s*$/, "").replace(/\s+/g, " ").trim();

const labelText = (label: HTMLLabelElement, field: HTMLElement): string => {
  // A wrapping label's own text, without the text of the field inside it.
  const copy = label.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(CONTROLS).forEach((node) => node.remove());
  return tidy(copy.textContent ?? "") || tidy(field.getAttribute("aria-label") ?? "");
};

/** The label a person sees and that a test can find the field by, with where it comes from. */
function accessibleLabel(element: HTMLElement): FieldLocator["label"] {
  const aria = tidy(element.getAttribute("aria-label") ?? "");
  if (aria) return { text: aria, source: "aria" };
  const labels = (element as HTMLInputElement).labels;
  const label = labels && labels.length ? labels[0] : null;
  if (!label) return undefined;
  const text = labelText(label, element);
  if (!text) return undefined;
  if (label.htmlFor) return { text, source: "for", id: element.id };
  // A button or custom dropdown inside its label shows its own value, so the label's text changes with
  // every choice and a test cannot find the field by it. Only plain fields are found by a wrapping label.
  const plainField = ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
  return plainField ? { text, source: "wrap" } : undefined;
}

/** A short path from the nearest ancestor with a stable id, with positions only where needed. */
function cssPath(element: HTMLElement): string {
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  for (let depth = 0; node && node.tagName !== "BODY" && depth < MAX_PATH_DEPTH; depth++) {
    if (node.id && !GENERATED_ID.test(node.id)) {
      parts.unshift(`#${CSS.escape(node.id)}`);
      break;
    }
    const tag = node.tagName.toLowerCase();
    const parent: HTMLElement | null = node.parentElement;
    const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === node!.tagName) : [];
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag);
    node = parent;
  }
  return parts.join(" > ");
}

const count = (counts: Map<string, number>, key: string | null | undefined): void => {
  if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
};

/**
 * Finds fields again on one page. It reads every control once to count labels, test attributes,
 * names and ids, so checking that each is unique costs nothing per field, even on a huge form.
 */
export function createLocator(document: Document): (element: HTMLElement) => FieldLocator {
  const labels = new Map<string, number>();
  const names = new Map<string, number>();
  const ids = new Map<string, number>();
  const attributes = new Map<string, number>();
  for (const control of Array.from(document.querySelectorAll<HTMLElement>(CONTROLS))) {
    count(labels, accessibleLabel(control)?.text);
    count(names, control.getAttribute("name"));
    count(ids, control.id);
    for (const attr of TEST_ATTRIBUTES) {
      const value = control.getAttribute(attr);
      if (value) count(attributes, `${attr}=${value}`);
    }
  }

  return (element) => {
    const locator: FieldLocator = { css: cssPath(element) };
    const label = accessibleLabel(element);
    if (label && labels.get(label.text) === 1) locator.label = label;
    for (const attr of TEST_ATTRIBUTES) {
      const value = element.getAttribute(attr);
      if (value && attributes.get(`${attr}=${value}`) === 1) {
        locator.testAttr = { attr, value };
        break;
      }
    }
    const name = element.getAttribute("name");
    if (name && names.get(name) === 1) locator.name = name;
    if (element.id && !GENERATED_ID.test(element.id) && ids.get(element.id) === 1) locator.id = element.id;
    return locator;
  };
}

/** Finds one field again. For many fields, use createLocator once instead. */
export const locate = (element: HTMLElement, document: Document): FieldLocator => createLocator(document)(element);
