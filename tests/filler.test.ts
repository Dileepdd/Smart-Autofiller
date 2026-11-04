import { describe, expect, it, vi } from "vitest";
import { collectFields, isDisabled, isVisible } from "../src/content/detector";
import { fillPage } from "../src/content/filler";
import { find, render, settingsWith } from "./helpers";

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SELECT_MARKUP = '<select id="field"><option value="a">A</option></select>';

describe("isDisabled", () => {
  it.each([
    ["input", '<input id="field">'],
    ["textarea", '<textarea id="field"></textarea>'],
    ["select", SELECT_MARKUP]
  ])("treats a plain %s as enabled", (_name, html) => {
    render(html);
    expect(isDisabled(find<FormField>("#field"))).toBe(false);
  });

  it.each([
    ["input", '<input id="field" disabled>'],
    ["textarea", '<textarea id="field" disabled></textarea>'],
    ["select", '<select id="field" disabled></select>']
  ])("detects a disabled %s", (_name, html) => {
    render(html);
    expect(isDisabled(find<FormField>("#field"))).toBe(true);
  });

  it.each([
    ["input", '<input id="field" aria-disabled="true">'],
    ["textarea", '<textarea id="field" aria-disabled="true"></textarea>'],
    ["select", '<select id="field" aria-disabled="true"></select>']
  ])("detects aria-disabled on a %s", (_name, html) => {
    render(html);
    expect(isDisabled(find<FormField>("#field"))).toBe(true);
  });

  it.each([
    ["input", '<input id="field" readonly>'],
    ["textarea", '<textarea id="field" readonly></textarea>']
  ])("detects a readonly %s", (_name, html) => {
    render(html);
    expect(isDisabled(find<FormField>("#field"))).toBe(true);
  });

  it("ignores readonly on a select, which does not support it", () => {
    render('<select id="field" readonly><option value="a">A</option></select>');
    expect(isDisabled(find<FormField>("#field"))).toBe(false);
  });

  it('ignores aria-disabled="false"', () => {
    render('<input id="field" aria-disabled="false">');
    expect(isDisabled(find<FormField>("#field"))).toBe(false);
  });

  it("detects a field inside a disabled fieldset", () => {
    render('<fieldset disabled><input id="field"></fieldset>');
    expect(isDisabled(find<FormField>("#field"))).toBe(true);
  });

  it("detects aria-readonly", () => {
    render('<input id="field" aria-readonly="true">');
    expect(isDisabled(find<FormField>("#field"))).toBe(true);
  });
});

describe("isVisible", () => {
  it("treats a field under aria-hidden as hidden", () => {
    render('<div aria-hidden="true"><input id="field"></div>');
    expect(isVisible(find("#field"))).toBe(false);
  });

  it("treats a field moved off-screen as hidden", () => {
    render('<input id="field">');
    vi.spyOn(find("#field"), "getBoundingClientRect").mockReturnValue(new DOMRect(-9999, 0, 100, 20));
    expect(isVisible(find("#field"))).toBe(false);
  });
});

describe("collectFields", () => {
  const ids = (): string[] => collectFields(document).map((element) => element.id);

  it("leaves out inputs that hold no user data", () => {
    render('<input id="a"><input type="color"><input type="range"><input type="image"><input type="file"><input type="hidden">');
    expect(ids()).toEqual(["a"]);
  });

  it("finds fields inside open shadow roots, however deep", () => {
    render('<div id="outer"></div>');
    const outer = find<HTMLElement>("#outer").attachShadow({ mode: "open" });
    outer.innerHTML = '<input id="a"><div id="inner"></div>';
    const inner = outer.querySelector("#inner")?.attachShadow({ mode: "open" });
    if (inner) inner.innerHTML = '<input id="b">';
    expect(ids()).toEqual(["a", "b"]);
  });

  it("finds fields inside same-origin iframes", () => {
    // happy-dom does not load iframes, so a separate document stands in for the frame's.
    render('<iframe id="frame"></iframe>');
    const frame = document.implementation.createHTMLDocument();
    frame.body.innerHTML = '<input id="a">';
    Object.defineProperty(find<HTMLIFrameElement>("#frame"), "contentDocument", { value: frame });
    expect(ids()).toEqual(["a"]);
  });

  it("survives a frame it is not allowed to read", () => {
    render('<input id="a"><iframe id="frame"></iframe>');
    Object.defineProperty(find<HTMLIFrameElement>("#frame"), "contentDocument", {
      get: () => { throw new Error("Blocked by same-origin policy"); }
    });
    expect(ids()).toEqual(["a"]);
  });

  it("returns a combobox wrapper instead of the input inside it", () => {
    render('<div id="wrapper" role="combobox"><input id="inner"></div>');
    expect(ids()).toEqual(["wrapper"]);
  });

  it("returns only the outermost editable region", () => {
    render('<div id="outer" contenteditable="true"><p id="inner" contenteditable="true"></p></div>');
    expect(ids()).toEqual(["outer"]);
  });
});

describe("fillPage dropdowns", () => {
  const dropdown = (options: string): void => render(`<select id="field">${options}</select>`);
  const selected = (): string => find<HTMLSelectElement>("#field").value;

  it("skips an empty-value placeholder and picks the first real option", async () => {
    dropdown('<option value="">Pick one</option><option value="a">A</option><option value="b">B</option>');

    const result = await fillPage(settingsWith());

    expect(selected()).toBe("a");
    expect(result).toMatchObject({ filled: 1, skipped: 0, errors: 0 });
  });

  it.each(["Select a country", "Choose one", "Please select", "-- none --"])(
    "skips the placeholder text %j even when it has a value",
    async (text) => {
      dropdown(`<option value="">Blank</option><option value="x">${text}</option><option value="a">A</option>`);

      await fillPage(settingsWith());

      expect(selected()).toBe("a");
    }
  );

  it("skips disabled options", async () => {
    dropdown('<option value="">Pick one</option><option value="a" disabled>A</option><option value="b">B</option>');

    await fillPage(settingsWith());

    expect(selected()).toBe("b");
  });

  it("counts a dropdown with no usable options as skipped", async () => {
    dropdown('<option value="">Pick one</option><option value="a" disabled>A</option>');

    const result = await fillPage(settingsWith());

    expect(selected()).toBe("");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("picks from usable options only in random mode", async () => {
    dropdown('<option value="">Pick one</option><option value="a">A</option><option value="b">B</option><option value="c" disabled>C</option>');
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await fillPage(settingsWith({ dropdownMode: "random" }));

    expect(selected()).toBe("b");
  });

  it("dispatches input and change events", async () => {
    dropdown('<option value="">Pick one</option><option value="a">A</option>');
    const events: string[] = [];
    const select = find<HTMLSelectElement>("#field");
    select.addEventListener("input", () => events.push("input"));
    select.addEventListener("change", () => events.push("change"));

    await fillPage(settingsWith());

    expect(events).toEqual(["input", "change"]);
  });

  it("skips options in a disabled group", async () => {
    dropdown('<option value="">Pick one</option><optgroup disabled><option value="a">A</option></optgroup><option value="b">B</option>');

    await fillPage(settingsWith());

    expect(selected()).toBe("b");
  });

  it("does not mistake real options for placeholders", async () => {
    dropdown('<option value="">Pick one</option><option value="s">Selective Service</option>');

    await fillPage(settingsWith());

    expect(selected()).toBe("s");
  });

  it("replaces a preselected placeholder that has a value", async () => {
    dropdown('<option value="0" selected>Select one</option><option value="a">A</option>');

    const result = await fillPage(settingsWith());

    expect(selected()).toBe("a");
    expect(result).toMatchObject({ filled: 1, skipped: 0 });
  });

  it("selects the configured country rather than the first option", async () => {
    render(`
      <label for="field">Country</label>
      <select id="field">
        <option value="">Choose</option><option value="AF">Afghanistan</option><option value="IN">India</option>
      </select>
    `);

    await fillPage(settingsWith({ country: "IN" }));

    expect(selected()).toBe("IN");
  });

  it.each(['<option value="IN">India (IN)</option>', '<option value="356">India</option>', '<option value="IN">Republic of India</option>'])(
    "recognises the country option %s",
    async (option) => {
      render(`<label for="field">Country</label><select id="field"><option value="">Choose</option><option value="xx">Elsewhere</option>${option}</select>`);

      await fillPage(settingsWith({ country: "IN" }));

      expect(selected()).not.toBe("xx");
    }
  );

  it("follows a custom rule", async () => {
    render('<label for="field">Plan</label><select id="field"><option value="">Choose</option><option value="f">Free</option><option value="p">Pro</option></select>');

    await fillPage(settingsWith({ customRules: [{ match: "plan", value: "Pro" }] }));

    expect(selected()).toBe("p");
  });

  it("selects a value in a multiple select", async () => {
    render('<select id="field" multiple><option value="a">A</option><option value="b">B</option></select>');

    const result = await fillPage(settingsWith());

    expect(result.filled).toBe(1);
    expect(selected()).toBe("a");
  });
});

describe("fillPage dependent dropdowns", () => {
  const STATES: Record<string, string[]> = { India: ["Andhra Pradesh", "Karnataka"], Canada: ["Ontario"] };
  const CITIES: Record<string, string[]> = { "Andhra Pradesh": ["Visakhapatnam"], Karnataka: ["Bengaluru"], Ontario: ["Toronto"] };

  const setOptions = (select: HTMLSelectElement, values: string[]): void => {
    select.innerHTML = `<option value="">Choose</option>${values.map((value) => `<option value="${value}">${value}</option>`).join("")}`;
    select.disabled = false;
  };

  /** Loads each child list after a delay, as a page fetching from its API would. */
  const renderCascade = (delayMs: number, order = ["country", "state", "city"]): void => {
    const markup: Record<string, string> = {
      country: '<label for="country">Country</label><select id="country"><option value="">Choose</option><option>Canada</option><option>India</option></select>',
      state: '<label for="state">State</label><select id="state" disabled><option value="">Choose</option></select>',
      city: '<label for="city">City</label><select id="city" disabled><option value="">Choose</option></select>'
    };
    render(order.map((name) => `<div>${markup[name]}</div>`).join("") + '<div><label for="zip">Postal Code</label><input id="zip"></div>');
    find<HTMLSelectElement>("#country").addEventListener("change", ({ target }) => {
      const { value } = target as HTMLSelectElement;
      setTimeout(() => setOptions(find<HTMLSelectElement>("#state"), STATES[value] ?? []), delayMs);
    });
    find<HTMLSelectElement>("#state").addEventListener("change", ({ target }) => {
      const { value } = target as HTMLSelectElement;
      setTimeout(() => setOptions(find<HTMLSelectElement>("#city"), CITIES[value] ?? []), delayMs);
    });
  };

  it("waits for each level to load", async () => {
    renderCascade(100);

    const result = await fillPage(settingsWith({ country: "IN" }));

    const state = find<HTMLSelectElement>("#state").value;
    expect(find<HTMLSelectElement>("#country").value).toBe("India");
    expect(STATES.India).toContain(state);
    expect(CITIES[state]).toContain(find<HTMLSelectElement>("#city").value);
    expect(result).toMatchObject({ filled: 4, skipped: 0, errors: 0 });
  });

  it("fills parents first whatever the order on the page", async () => {
    renderCascade(50, ["city", "state", "country"]);

    await fillPage(settingsWith({ country: "IN" }));

    expect(find<HTMLSelectElement>("#city").value).not.toBe("");
  });

  it("keeps later text fields consistent with what was selected", async () => {
    renderCascade(20);

    await fillPage(settingsWith({ country: "IN" }));

    const postal: Record<string, string> = { Visakhapatnam: "530001", Bengaluru: "560001" };
    expect(find("#zip").value).toBe(postal[find<HTMLSelectElement>("#city").value]);
  });

  it("adopts the country the page offers when the configured one is missing", async () => {
    renderCascade(20);

    await fillPage(settingsWith({ country: "AU" }));

    expect(find<HTMLSelectElement>("#country").value).toBe("Canada");
    expect(find<HTMLSelectElement>("#state").value).toBe("Ontario");
    expect(find("#zip").value).toBe("M5V 2T6");
  });

  it("gives up on a list that never loads and still fills the rest", async () => {
    render(`
      <div><label for="country">Country</label><select id="country"><option value="">Choose</option><option>India</option></select></div>
      <div><label for="state">State</label><select id="state" disabled><option value="">Choose</option></select></div>
      <div><label for="email">Email</label><input id="email"></div>
    `);

    const result = await fillPage(settingsWith());

    expect(find("#email").value).toContain("@");
    expect(result).toMatchObject({ filled: 2, skipped: 1, errors: 0 });
  }, 6000);

  it("does not wait when nothing changed that could enable a list", async () => {
    render('<select id="field" disabled><option value="a">A</option></select>');
    const started = Date.now();

    const result = await fillPage(settingsWith());

    expect(Date.now() - started).toBeLessThan(500);
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });
});

describe("fillPage custom dropdowns", () => {
  /** A minimal ARIA select that renders its list in a portal only once opened. */
  const renderCombobox = (labels: string[], openEvent = "click"): void => {
    render(`
      <div><span id="caption">Country</span><div id="field" role="combobox" tabindex="0" aria-expanded="false" aria-labelledby="caption"></div></div>
      <button id="danger" type="submit">Delete account</button>
    `);
    const trigger = find<HTMLElement>("#field");
    trigger.addEventListener(openEvent, () => {
      trigger.setAttribute("aria-expanded", "true");
      const list = document.createElement("ul");
      list.setAttribute("role", "listbox");
      for (const label of labels) {
        const option = document.createElement("li");
        option.setAttribute("role", "option");
        option.textContent = label;
        if (label.startsWith("Disabled")) option.setAttribute("aria-disabled", "true");
        option.addEventListener("click", () => {
          trigger.textContent = label;
          trigger.setAttribute("aria-expanded", "false");
          list.remove();
        });
        list.append(option);
      }
      document.body.append(list);
    });
  };

  const shown = (): string | null => find<HTMLElement>("#field").textContent;

  it("opens the list and picks the matching option", async () => {
    renderCombobox(["Canada", "India"]);

    const result = await fillPage(settingsWith({ country: "IN" }));

    expect(shown()).toBe("India");
    expect(result).toMatchObject({ filled: 1, errors: 0 });
  });

  it("opens on mousedown as well as click", async () => {
    renderCombobox(["India"], "mousedown");

    await fillPage(settingsWith({ country: "IN" }));

    expect(shown()).toBe("India");
  });

  it("ignores disabled and placeholder options", async () => {
    renderCombobox(["Select one", "Disabled option", "Canada"]);

    await fillPage(settingsWith({ country: "IN" }));

    expect(shown()).toBe("Canada");
  });

  it("feeds the selection back into the profile", async () => {
    renderCombobox(["India"]);
    document.body.insertAdjacentHTML("beforeend", '<div><label for="tax">Tax ID</label><input id="tax"></div>');

    await fillPage(settingsWith({ country: "US" }));

    expect(find("#tax").value).toMatch(/^[A-Z]{5}\d{4}[A-Z]$/);
  });

  it("leaves a combobox with a value alone by default", async () => {
    renderCombobox(["India"]);
    find<HTMLElement>("#field").textContent = "Canada";

    const result = await fillPage(settingsWith());

    expect(shown()).toBe("Canada");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("treats a zero-width space as empty, as MUI renders in an empty select", async () => {
    renderCombobox(["India"]);
    find<HTMLElement>("#field").innerHTML = "<span>​</span>";

    await fillPage(settingsWith({ country: "IN" }));

    expect(shown()).toBe("India");
  });

  it("sees a selection shown beside an empty input, as react-select renders it", async () => {
    render('<div><div>Canada</div><div><input id="field" role="combobox" aria-label="Country"></div></div>');

    const result = await fillPage(settingsWith());

    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("treats placeholder text beside an empty input as empty", async () => {
    render('<div><div>Select...</div><div><input id="field" role="combobox" aria-label="City"></div></div>');

    const result = await fillPage(settingsWith());

    expect(result.filled).toBe(1);
  }, 5000);

  it("skips a disabled combobox", async () => {
    renderCombobox(["India"]);
    find<HTMLElement>("#field").setAttribute("aria-disabled", "true");

    const result = await fillPage(settingsWith());

    expect(shown()).toBe("");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("reports a dropdown that never opens", async () => {
    render('<div id="field" role="combobox" aria-label="Country"></div>');

    const result = await fillPage(settingsWith());

    expect(result).toMatchObject({ filled: 0, errors: 1 });
    expect(result.details[0]).toContain("Could not open dropdown");
  });

  it("types into a type-ahead combobox and picks a suggestion", async () => {
    render('<div><label for="field">City</label><input id="field" role="combobox"></div>');
    const input = find("#field");
    input.addEventListener("input", () => {
      document.body.insertAdjacentHTML("beforeend", `<ul role="listbox"><li id="hit" role="option">${input.value}</li></ul>`);
      find<HTMLElement>("#hit").addEventListener("click", () => { input.dataset.picked = "yes"; });
    });

    await fillPage(settingsWith());

    expect(input.dataset.picked).toBe("yes");
  });

  it("keeps the typed text when a type-ahead combobox offers nothing", async () => {
    render('<div><label for="field">City</label><input id="field" role="combobox"></div>');

    const result = await fillPage(settingsWith({ country: "IN" }));

    expect(find("#field").value).not.toBe("");
    expect(result).toMatchObject({ filled: 1, errors: 0 });
  }, 5000);

  it("never clicks anything except the trigger and its options", async () => {
    renderCombobox(["India"]);
    const clicked: string[] = [];
    const record = ({ target }: Event): void => {
      const element = target as HTMLElement;
      clicked.push(element.getAttribute("role") ?? element.tagName);
    };
    document.addEventListener("click", record);

    await fillPage(settingsWith());
    document.removeEventListener("click", record);

    expect(clicked).toEqual(["combobox", "option"]);
  });
});

describe("fillPage checkboxes and radios", () => {
  it("leaves optional checkboxes unticked", async () => {
    render('<input id="field" type="checkbox" name="newsletter">');

    const result = await fillPage(settingsWith({ fillExisting: true }));

    expect(find("#field").checked).toBe(false);
    expect(find("#field").value).toBe("on");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it.each(['required', 'aria-required="true"'])("ticks a checkbox marked %s", async (attribute) => {
    render(`<input id="field" type="checkbox" name="terms" ${attribute}>`);
    const changes = vi.fn();
    find("#field").addEventListener("change", changes);

    const result = await fillPage(settingsWith());

    expect(find("#field").checked).toBe(true);
    expect(changes).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ filled: 1, skipped: 0 });
  });

  it("does not untick a checkbox that is already ticked", async () => {
    render('<input id="field" type="checkbox" required checked>');

    await fillPage(settingsWith({ fillExisting: true }));

    expect(find("#field").checked).toBe(true);
  });

  it("selects one radio per group and counts the group once", async () => {
    render(`
      <input id="a" type="radio" name="g" value="a"><input id="b" type="radio" name="g" value="b">
      <input id="c" type="radio" name="h" value="c">
    `);

    const result = await fillPage(settingsWith());

    expect(find("#a").checked).toBe(true);
    expect(find("#b").checked).toBe(false);
    expect(find("#c").checked).toBe(true);
    expect(find("#a").value).toBe("a");
    expect(result).toMatchObject({ filled: 2, skipped: 0 });
  });

  it("keeps an existing radio selection", async () => {
    render('<input id="a" type="radio" name="g"><input id="b" type="radio" name="g" checked>');

    const result = await fillPage(settingsWith({ fillExisting: true }));

    expect(find("#b").checked).toBe(true);
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("skips disabled radios", async () => {
    render('<input id="a" type="radio" name="g" disabled><input id="b" type="radio" name="g">');

    await fillPage(settingsWith());

    expect(find("#b").checked).toBe(true);
  });

  it("uses the dropdown mode for radios", async () => {
    render('<input id="a" type="radio" name="g"><input id="b" type="radio" name="g">');
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await fillPage(settingsWith({ dropdownMode: "random" }));

    expect(find("#b").checked).toBe(true);
  });
});

describe("fillPage dynamic forms", () => {
  it("fills fields revealed by an earlier selection", async () => {
    render('<div><label for="type">Account type</label><select id="type"><option value="">Choose</option><option>Business</option></select></div>');
    find<HTMLSelectElement>("#type").addEventListener("change", () => {
      document.body.insertAdjacentHTML("beforeend", '<div><label for="tax">Tax ID</label><input id="tax"></div>');
    });

    const result = await fillPage(settingsWith());

    expect(find("#tax").value).toMatch(/^12-\d{7}$/);
    expect(result).toMatchObject({ filled: 2, skipped: 0 });
  });

  it("fills a field enabled by an earlier selection", async () => {
    render(`
      <div><label for="type">Account type</label><select id="type"><option value="">Choose</option><option>Business</option></select></div>
      <div><label for="email">Email</label><input id="email" disabled></div>
    `);
    find<HTMLSelectElement>("#type").addEventListener("change", () => { find("#email").disabled = false; });

    const result = await fillPage(settingsWith());

    expect(find("#email").value).toContain("@");
    expect(result).toMatchObject({ filled: 2, skipped: 0 });
  });

  it("stops rescanning a page that keeps adding fields", async () => {
    render('<div><input id="seed" name="email"></div>');
    let added = 0;
    const addField = (): void => {
      document.body.insertAdjacentHTML("beforeend", `<div><input id="extra${added++}" name="email"></div>`);
    };
    document.addEventListener("change", addField);

    const result = await fillPage(settingsWith());
    document.removeEventListener("change", addField);

    expect(result.filled).toBeLessThanOrEqual(16);
  });

  it("fills fields inside shadow roots with working events", async () => {
    render('<div id="host"></div>');
    const shadow = find<HTMLElement>("#host").attachShadow({ mode: "open" });
    shadow.innerHTML = '<label for="inner">Email</label><input id="inner">';
    const input = shadow.querySelector("input");

    await fillPage(settingsWith({ emailDomain: "acme.test" }));

    expect(input?.value).toMatch(/@acme\.test$/);
  });

  it("fills contenteditable regions", async () => {
    render('<div id="field" contenteditable="true" aria-label="Notes"></div>');
    const inputs = vi.fn();
    find<HTMLElement>("#field").addEventListener("input", inputs);

    const result = await fillPage(settingsWith());

    expect(find<HTMLElement>("#field").textContent).not.toBe("");
    expect(inputs).toHaveBeenCalledOnce();
    expect(result.filled).toBe(1);
  });

  it("leaves populated contenteditable regions alone", async () => {
    render('<div id="field" contenteditable="true">Keep me</div>');

    await fillPage(settingsWith());

    expect(find<HTMLElement>("#field").textContent).toBe("Keep me");
  });
});

describe("fillPage safety", () => {
  it("never submits a form", async () => {
    render('<form id="form"><input name="email" required><input type="checkbox" required><button type="submit">Send</button></form>');
    const submits = vi.fn((event: Event) => event.preventDefault());
    find<HTMLFormElement>("#form").addEventListener("submit", submits);

    await fillPage(settingsWith());

    expect(submits).not.toHaveBeenCalled();
  });

  it("leaves card details, one-time codes and search boxes empty", async () => {
    render(`
      <div><input id="card" autocomplete="cc-number"></div>
      <div><input id="cvv" name="cvv"></div>
      <div><input id="otp" autocomplete="one-time-code"></div>
      <div><input id="search" type="search"></div>
    `);

    const result = await fillPage(settingsWith());

    for (const id of ["card", "cvv", "otp", "search"]) expect(find(`#${id}`).value).toBe("");
    expect(result).toMatchObject({ filled: 0, skipped: 4 });
  });

  it("lets a custom rule fill a field that would otherwise be skipped", async () => {
    render('<input id="field" name="cardNumber">');

    await fillPage(settingsWith({ customRules: [{ match: "card number", value: "4242" }] }));

    expect(find("#field").value).toBe("4242");
  });

  it("reports a field that rejects its value rather than counting it as filled", async () => {
    render('<input id="field" name="email">');
    find("#field").addEventListener("input", ({ target }) => { (target as HTMLInputElement).value = ""; });

    const result = await fillPage(settingsWith());

    expect(result).toMatchObject({ filled: 0, errors: 1 });
    expect(result.details[0]).toContain("rejected");
  });

  it("reports a field that clears its value after blur", async () => {
    render('<div><input id="field" name="startDate"></div>');
    const input = find("#field");
    input.addEventListener("blur", () => { setTimeout(() => { input.value = ""; }, 20); });

    const result = await fillPage(settingsWith());

    expect(result).toMatchObject({ filled: 0, errors: 1 });
    expect(result.details[0]).toContain("cleared");
  });

  it("keeps going when one field throws", async () => {
    render('<div><input id="a" name="email"></div><div><input id="b" name="city"></div>');
    vi.spyOn(find("#a"), "dispatchEvent").mockImplementation(() => { throw new Error("Page script failed"); });

    const result = await fillPage(settingsWith());

    expect(find("#b").value).not.toBe("");
    expect(result).toMatchObject({ filled: 1, errors: 1 });
  });
});

describe("fillPage field states", () => {
  it.each([
    ["input", '<input id="field" name="email">'],
    ["textarea", '<textarea id="field" name="email"></textarea>']
  ])("fills an empty %s", async (_name, html) => {
    render(html);

    const result = await fillPage(settingsWith({ emailDomain: "acme.test" }));

    expect(find("#field").value).toMatch(/@acme\.test$/);
    expect(result).toMatchObject({ filled: 1, skipped: 0, errors: 0 });
  });

  it("dispatches input and change events on a filled field", async () => {
    render('<input id="field" name="email">');
    const events: string[] = [];
    const input = find("#field");
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    await fillPage(settingsWith());

    expect(events).toEqual(["input", "change"]);
  });

  it("leaves a populated field alone by default", async () => {
    render('<input id="field" name="email" value="keep@me.test">');

    const result = await fillPage(settingsWith());

    expect(find("#field").value).toBe("keep@me.test");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("treats a whitespace-only field as empty", async () => {
    render('<input id="field" name="email" value="   ">');

    const result = await fillPage(settingsWith());

    expect(find("#field").value).toContain("@");
    expect(result).toMatchObject({ filled: 1, skipped: 0 });
  });

  it("overwrites a populated field when fillExisting is on", async () => {
    render('<input id="field" name="email" value="old@me.test">');

    const result = await fillPage(settingsWith({ emailDomain: "acme.test", fillExisting: true }));

    expect(find("#field").value).toMatch(/@acme\.test$/);
    expect(result).toMatchObject({ filled: 1, skipped: 0 });
  });

  it("leaves a dropdown with an existing selection alone by default", async () => {
    render('<select id="field"><option value="a">A</option><option value="b" selected>B</option></select>');

    const result = await fillPage(settingsWith());

    expect(find<HTMLSelectElement>("#field").value).toBe("b");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it.each([
    ["disabled", '<input id="field" name="email" disabled>'],
    ["readonly", '<input id="field" name="email" readonly>'],
    ["aria-disabled", '<input id="field" name="email" aria-disabled="true">'],
    ["hidden by CSS", '<input id="field" name="email" style="display: none">']
  ])("skips a %s field even when fillExisting is on", async (_name, html) => {
    render(html);

    const result = await fillPage(settingsWith({ fillExisting: true }));

    expect(find("#field").value).toBe("");
    expect(result).toMatchObject({ filled: 0, skipped: 1 });
  });

  it("does not touch input types that hold no user data", async () => {
    render('<input type="hidden" name="email"><input type="submit" name="email"><input type="button" name="email">');

    const result = await fillPage(settingsWith());

    expect(result).toMatchObject({ filled: 0, skipped: 0, errors: 0 });
  });

  it("writes the same password into confirmation fields", async () => {
    render('<div><input id="a" type="password" name="password"></div><div><input id="b" type="password" name="confirmPassword"></div>');

    await fillPage(settingsWith());

    expect(find("#a").value).not.toBe("");
    expect(find("#a").value).toBe(find("#b").value);
  });

  it("writes a real date into a date of birth field", async () => {
    render('<label for="field">Date of Birth</label><input id="field" type="date">');

    const result = await fillPage(settingsWith());

    expect(find("#field").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toMatchObject({ filled: 1, errors: 0 });
  });

  it("fills a mixed form with one value per field type", async () => {
    render(`
      <form>
        <label for="full">Full Name</label><input id="full">
        <label for="email">Email</label><input id="email">
        <label for="tax">Tax ID</label><input id="tax">
        <label for="age">Age</label><input id="age">
        <label for="years">Years of Experience</label><input id="years">
        <label for="done">Notes</label><input id="done" value="existing" readonly>
      </form>
    `);

    const result = await fillPage(settingsWith({
      emailDomain: "acme.test", ageMin: 30, ageMax: 30, experienceMin: 4, experienceMax: 4
    }));

    expect(find("#full").value).toMatch(/\S+ \S+/);
    const [first] = find("#full").value.toLowerCase().replace(/[^a-z ]/g, "").split(" ");
    expect(find("#email").value).toContain(first);
    expect(find("#email").value).toMatch(/@acme\.test$/);
    expect(find("#tax").value).toMatch(/^12-\d{7}$/);
    expect(find("#age").value).toBe("30");
    expect(find("#years").value).toBe("4");
    expect(find("#done").value).toBe("existing");
    expect(result).toMatchObject({ filled: 5, skipped: 1, errors: 0 });
  });
});
