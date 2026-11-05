import { describe, expect, it, vi } from "vitest";
import { clearPage } from "../src/content/clear";
import { isRequired } from "../src/content/context";
import { fillFocusedField } from "../src/content/field";
import { fillPage } from "../src/content/filler";
import { undoLastFill } from "../src/content/undo";
import { find, render, settingsWith } from "./helpers";

const visible = (): void => {
  for (const element of Array.from(document.querySelectorAll<HTMLElement>("input, textarea, select, [contenteditable]"))) {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 100, height: 20, right: 100, bottom: 20 } as DOMRect);
  }
};

const page = (html: string): void => {
  render(html);
  visible();
};

describe("isRequired", () => {
  it.each([
    ["the required attribute", `<input id="a" required>`],
    ["aria-required", `<input id="a" aria-required="true">`],
    ["an asterisk in the label", `<label for="a">Name *</label><input id="a">`],
    ["an asterisk in its own element", `<label for="a">Name <span>*</span></label><input id="a">`],
    ["the word required", `<label for="a">Name (required)</label><input id="a">`],
    ["a required radio in the group", `<input type="radio" name="g" required><input id="a" type="radio" name="g">`]
  ])("recognises %s", (_name, html) => {
    render(html);
    expect(isRequired(find("#a"))).toBe(true);
  });

  it("does not treat other fields as required", () => {
    render(`<label for="a">Name</label><input id="a">`);
    expect(isRequired(find("#a"))).toBe(false);
  });
});

describe("required fields only", () => {
  it("fills required fields and leaves the rest", async () => {
    page(`<label for="a">Email *</label><input id="a"><label for="b">Nickname</label><input id="b">`);

    const result = await fillPage(settingsWith({ requiredOnly: true }));

    expect(find("#a").value).toContain("@");
    expect(find("#b").value).toBe("");
    expect(result).toMatchObject({ filled: 1, skipped: 1 });
  });

  it("still lets an optional preset country drive the data", async () => {
    page(`<label for="c">Country</label><select id="c"><option>United States</option><option>India</option></select>
      <label for="z">ZIP code *</label><input id="z">`);

    await fillPage(settingsWith({ requiredOnly: true, fillExisting: true }));

    expect(find("#z").value).toMatch(/^\d{5}$/);
  });
});

describe("data modes in a fill", () => {
  it("writes the mode's value and never counts a bad value as a problem", async () => {
    page(`<label for="e">Email</label><input id="e" type="email">`);

    const result = await fillPage(settingsWith({ dataMode: "invalid" }));

    expect(find("#e").value).toBe("user@@example");
    expect(result).toMatchObject({ filled: 1, errors: 0 });
  });

  it("types an invalid date as text, past any date picker", async () => {
    page(`<label for="d">Start date</label><input id="d" type="text">`);

    await fillPage(settingsWith({ dataMode: "invalid" }));

    expect(find("#d").value).toBe("2024-13-45");
  });

  it("keeps dropdowns valid, so the rest of a form can still be reached", async () => {
    page(`<label for="s">Plan</label><select id="s"><option value="">Choose</option><option>Basic</option></select>`);

    await fillPage(settingsWith({ dataMode: "invalid" }));

    expect(find<HTMLSelectElement>("#s").value).toBe("Basic");
  });

  it("gives custom rules priority over the mode", async () => {
    page(`<label for="e">Email</label><input id="e">`);

    await fillPage(settingsWith({ dataMode: "invalid", customRules: [{ match: "email", value: "fixed@example.com" }] }));

    expect(find("#e").value).toBe("fixed@example.com");
  });

  it("still skips payment fields", async () => {
    page(`<label for="c">Card number</label><input id="c">`);

    await fillPage(settingsWith({ dataMode: "invalid" }));

    expect(find("#c").value).toBe("");
  });

  it("keeps a password and its confirmation equal in edge case mode", async () => {
    page(`<label for="p">Password</label><input id="p" type="password"><label for="q">Confirm password</label><input id="q" type="password">`);

    await fillPage(settingsWith({ dataMode: "edge" }));

    expect(find("#p").value).not.toBe("");
    expect(find("#p").value).toBe(find("#q").value);
  });
});

describe("clearPage", () => {
  it("empties text, checkboxes and dropdowns with a blank option", () => {
    page(`<input id="t" value="text"><input id="c" type="checkbox" checked>
      <select id="s"><option value="">Choose</option><option selected>One</option></select>
      <textarea id="m">note</textarea>`);

    const result = clearPage(settingsWith());

    expect(find("#t").value).toBe("");
    expect(find("#c").checked).toBe(false);
    expect(find<HTMLSelectElement>("#s").value).toBe("");
    expect(find<HTMLTextAreaElement>("#m").value).toBe("");
    expect(result).toEqual({ cleared: 4, notCleared: 0 });
  });

  it("reports what it cannot empty", () => {
    page(`<input id="r" type="radio" checked><select id="s"><option>One</option><option>Two</option></select>`);

    expect(clearPage(settingsWith())).toEqual({ cleared: 0, notCleared: 2 });
    expect(find("#r").checked).toBe(true);
  });

  it("leaves read-only, disabled and search fields alone", () => {
    page(`<input id="r" value="a" readonly><input id="d" value="b" disabled><input id="q" type="search" value="c">`);

    expect(clearPage(settingsWith())).toEqual({ cleared: 0, notCleared: 0 });
    expect(find("#r").value).toBe("a");
    expect(find("#d").value).toBe("b");
    expect(find("#q").value).toBe("c");
  });

  it("can be undone", () => {
    page(`<input id="t" value="text"><input id="c" type="checkbox" checked>`);

    clearPage(settingsWith());
    undoLastFill();

    expect(find("#t").value).toBe("text");
    expect(find("#c").checked).toBe(true);
  });
});

describe("fillFocusedField", () => {
  const focused = (html: string): HTMLInputElement => {
    page(html);
    const element = find("#f");
    element.focus();
    return element;
  };

  it("generates a value that suits the field", () => {
    const element = focused(`<label for="f">Email</label><input id="f">`);

    expect(fillFocusedField(settingsWith())).toEqual({ filled: true, message: "Filled this field." });
    expect(element.value).toContain("@");
  });

  it("writes a chosen value exactly, including over a declared length", () => {
    const element = focused(`<input id="f" maxlength="3">`);

    fillFocusedField(settingsWith(), "too long");

    expect(element.value).toBe("too long");
  });

  it("follows the data mode", () => {
    const element = focused(`<label for="f">Email</label><input id="f">`);

    fillFocusedField(settingsWith({ dataMode: "invalid" }));

    expect(element.value).toBe("user@@example");
  });

  it("can be undone", () => {
    const element = focused(`<input id="f" value="before">`);

    fillFocusedField(settingsWith(), "after");
    undoLastFill();

    expect(element.value).toBe("before");
  });

  it("refuses read-only fields, even for a chosen value", () => {
    const element = focused(`<input id="f" value="kept" readonly>`);

    expect(fillFocusedField(settingsWith(), "new")).toEqual({ filled: false, message: "This field cannot be edited." });
    expect(element.value).toBe("kept");
  });

  it("will not generate into a payment field, but accepts a chosen value", () => {
    const element = focused(`<label for="f">Card number</label><input id="f">`);

    expect(fillFocusedField(settingsWith()).filled).toBe(false);
    expect(element.value).toBe("");
    expect(fillFocusedField(settingsWith(), "0").filled).toBe(true);
  });

  it("says so when no text field has focus", () => {
    page(`<input id="c" type="checkbox">`);
    find("#c").focus();

    expect(fillFocusedField(settingsWith()).message).toBe("Click inside a text field first.");
  });

  it("finds a focused field inside a shadow root", () => {
    render(`<div id="host"></div>`);
    const input = document.createElement("input");
    find<HTMLElement>("#host").attachShadow({ mode: "open" }).append(input);
    vi.spyOn(input, "getBoundingClientRect").mockReturnValue({ width: 100, height: 20, right: 100, bottom: 20 } as DOMRect);
    input.focus();

    expect(fillFocusedField(settingsWith(), "value").filled).toBe(true);
    expect(input.value).toBe("value");
  });

  it("reports a value the field refuses", () => {
    focused(`<input id="f" type="number">`);

    expect(fillFocusedField(settingsWith(), "abc")).toEqual({ filled: false, message: "The field rejected that value." });
  });
});
