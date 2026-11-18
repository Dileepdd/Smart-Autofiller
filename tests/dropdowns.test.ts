import { describe, expect, it, vi } from "vitest";
import { classifyField } from "../src/content/classifier";
import { fillCombobox } from "../src/content/customDropdown";
import { collectFields, isCombobox, isInactive, isVisible } from "../src/content/detector";
import { fillPage } from "../src/content/filler";
import { find, render, settingsWith } from "./helpers";

const opensList = (trigger: HTMLElement, options: string, onPick?: (option: HTMLElement) => void): void => {
  trigger.addEventListener("click", () => {
    if (document.querySelector("#list")) return;
    trigger.setAttribute("aria-expanded", "true");
    document.body.insertAdjacentHTML("beforeend", `<div id="list" role="listbox">${options}</div>`);
    document.querySelectorAll<HTMLElement>("#list [role=option]").forEach((option) => option.addEventListener("click", () => {
      onPick?.(option);
      trigger.setAttribute("aria-expanded", "false");
      find("#list").remove();
    }));
  });
};

const escapes = (): { count: () => number; stop: () => void } => {
  const seen = vi.fn();
  const listener = (event: KeyboardEvent): void => { if (event.key === "Escape") seen(); };
  document.addEventListener("keydown", listener);
  return { count: () => seen.mock.calls.length, stop: () => document.removeEventListener("keydown", listener) };
};

describe("options in a custom list", () => {
  it("clicks a highlighted first row, which cmdk marks as selected whatever the value is", async () => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">Please select</button>');
    const trigger = find<HTMLElement>("#field");
    opensList(trigger, '<div cmdk-item="" role="option" aria-selected="true">BBA</div><div cmdk-item="" role="option">CAT</div>', (option) => { trigger.textContent = option.textContent; });

    expect(await fillCombobox(trigger, [], "", "first")).toBe("BBA");
    expect(trigger.textContent).toBe("BBA");
  });

  it("still leaves alone an option a normal list marks as selected, because clicking could clear it", async () => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">India</button>');
    const trigger = find<HTMLElement>("#field");
    const picked = vi.fn();
    opensList(trigger, '<div role="option" aria-selected="true">Bharat</div>', picked);

    await fillCombobox(trigger, [], "", "first");

    expect(picked).not.toHaveBeenCalled();
  });

  it.each(["Clear selection", "No results found.", "Searching...", "Loading..."])("never picks %s", async (row) => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">Pick</button>');
    const trigger = find<HTMLElement>("#field");
    opensList(trigger, `<div role="option">${row}</div><div role="option">Real</div>`, (option) => { trigger.textContent = option.textContent; });

    expect(await fillCombobox(trigger, [], "", "first")).toBe("Real");
  });

  it("never clicks a button that appeared with a list that has no roles", async () => {
    render('<button id="field" type="button" aria-haspopup="listbox">Pick</button>');
    const trigger = find<HTMLElement>("#field");
    const clicked = vi.fn();
    trigger.addEventListener("click", () => {
      if (document.querySelector("#panel")) return;
      document.body.insertAdjacentHTML("beforeend", '<div id="panel"><button type="button">Save</button><button type="button">Apply</button></div>');
      document.querySelectorAll("#panel button").forEach((button) => button.addEventListener("click", clicked));
    });

    await fillCombobox(trigger, [], "", "first");

    expect(clicked).not.toHaveBeenCalled();
  }, 8000);
});

describe("rows that are plain buttons in a popup", () => {
  const rows = (labels: string[]): string =>
    `<div id="panel" role="dialog"><input placeholder="Search"><div>${labels.map((label) => `<button type="button" class="row"><span class="text">${label}</span></button>`).join("")}</div><button type="button" class="more">Load more</button></div>`;

  const openPanel = (trigger: HTMLElement, labels: string[]): void => {
    trigger.addEventListener("click", () => {
      if (document.querySelector("#panel")) return;
      trigger.setAttribute("aria-expanded", "true");
      document.body.insertAdjacentHTML("beforeend", rows(labels));
      document.querySelectorAll<HTMLElement>("#panel .row").forEach((row) => row.addEventListener("click", () => {
        trigger.textContent = row.textContent;
        trigger.setAttribute("aria-expanded", "false");
        find("#panel").remove();
      }));
    });
  };

  it("selects a row", async () => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">Select State</button>');
    const trigger = find<HTMLElement>("#field");
    openPanel(trigger, ["Alabama", "Alaska"]);

    expect(await fillCombobox(trigger, ["Alaska"], "", "match")).toBe("Alaska");
    expect(trigger.textContent).toBe("Alaska");
  });

  it("keeps a value already there when the wanted option is not on show, rather than taking the first row", async () => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">United States</button>');
    const trigger = find<HTMLElement>("#field");
    openPanel(trigger, ["Afghanistan", "Albania"]);
    const close = (event: KeyboardEvent): void => {
      if (event.key === "Escape") { trigger.setAttribute("aria-expanded", "false"); find("#panel").remove(); }
    };
    document.addEventListener("keydown", close);

    const label = await fillCombobox(trigger, ["India"], "", "match");
    document.removeEventListener("keydown", close);

    expect(label).toBe("United States");
    expect(trigger.textContent).toBe("United States");
  });
});

describe("dependent dropdowns setting", () => {
  it("still follows native selects while off, because they are instant", async () => {
    render('<select id="country" aria-label="Country"><option value="">Select</option><option>India</option></select><select id="state" aria-label="State" disabled></select>');
    find<HTMLSelectElement>("#country").addEventListener("change", () => {
      const state = find<HTMLSelectElement>("#state");
      setTimeout(() => { state.innerHTML = '<option value="">Select</option><option>Goa</option>'; state.disabled = false; }, 100);
    });

    await fillPage(settingsWith({ fillDependentDropdowns: false, country: "IN" }));

    expect(find<HTMLSelectElement>("#state").value).toBe("Goa");
  });

  it.each(["Yes", "No", "Back Office"])("can pick %s from a list of button rows", async (option) => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">Pick</button>');
    const trigger = find<HTMLElement>("#field");
    trigger.addEventListener("click", () => {
      if (document.querySelector("#panel")) return;
      document.body.insertAdjacentHTML("beforeend", `<div id="panel"><button type="button" class="row">${option}</button><button type="button" class="row">Other</button></div>`);
      document.querySelector<HTMLElement>("#panel .row")!.addEventListener("click", () => { trigger.textContent = option; find("#panel").remove(); });
    });

    expect(await fillCombobox(trigger, [option], "", "match")).toBe(option);
  });

  const form = `
    <button id="state" type="button" role="combobox" aria-label="State" aria-expanded="false">Select State</button>
    <button id="city" type="button" role="combobox" aria-label="City" aria-expanded="false">Select City</button>`;

  const pickable = (id: string, option: string, onPick?: () => void): void => {
    const trigger = find<HTMLElement>(id);
    opensList(trigger, `<div role="option">${option}</div>`, (row) => { trigger.textContent = row.textContent; onPick?.(); });
  };

  it("is off by default, and leaves a child of a field it just changed alone", async () => {
    render(form);
    pickable("#state", "Goa");
    pickable("#city", "Panaji");

    const result = await fillPage(settingsWith({ fillDependentDropdowns: false }));

    expect(find<HTMLElement>("#state").textContent).toBe("Goa");
    expect(find<HTMLElement>("#city").textContent).toBe("Select City");
    expect(result).toMatchObject({ filled: 1, errors: 0 });
  });

  it("does not wait for a field disabled until its parent is chosen", async () => {
    render(`${form.replace('id="city"', 'id="city" disabled')}`);
    pickable("#state", "Goa", () => { find<HTMLButtonElement>("#city").disabled = false; });
    const started = Date.now();

    await fillPage(settingsWith({ fillDependentDropdowns: false }));

    expect(Date.now() - started).toBeLessThan(2000);
    expect(find<HTMLElement>("#city").textContent).toBe("Select City");
  });

  it("fills the child when turned on", async () => {
    render(form);
    pickable("#state", "Goa");
    pickable("#city", "Panaji");

    await fillPage(settingsWith({ fillDependentDropdowns: true }));

    expect(find<HTMLElement>("#city").textContent).toBe("Panaji");
  });
});

describe("closing a list", () => {
  it("does not send Escape when the list closed by itself, so a dialog behind it stays open", async () => {
    render('<div role="dialog"><button id="field" type="button" role="combobox" aria-expanded="false">Pick</button></div>');
    const trigger = find<HTMLElement>("#field");
    opensList(trigger, '<div role="option">One</div>', (option) => { trigger.textContent = option.textContent; });
    const seen = escapes();

    await fillCombobox(trigger, [], "", "first");
    seen.stop();

    expect(seen.count()).toBe(0);
  });

  it("sends Escape to a list that a press on its trigger cannot close", async () => {
    render('<button id="field" type="button" role="combobox" aria-expanded="false">One</button>');
    const trigger = find<HTMLElement>("#field");
    opensList(trigger, '<div role="option">One</div>');
    const close = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      trigger.setAttribute("aria-expanded", "false");
      find("#list").remove();
    };
    document.addEventListener("keydown", close);

    await fillCombobox(trigger, [], "", "first");
    document.removeEventListener("keydown", close);

    expect(document.querySelector("#list")).toBeNull();
  });
});

describe("dropdowns that depend on another", () => {
  it("treats a disabled button as waiting for its parent", () => {
    render('<button id="field" type="button" role="combobox" disabled>City</button>');
    expect(isInactive(find<HTMLElement>("#field"))).toBe(true);
  });

  it("tries a failed list again after a later selection and reports nothing", async () => {
    render(`
      <button id="child" type="button" role="combobox" aria-label="Lead Substage" aria-expanded="false">Pick</button>
      <button id="parent" type="button" role="combobox" aria-label="Lead Stage" aria-expanded="false">Pick</button>`);
    const child = find<HTMLElement>("#child");
    const parent = find<HTMLElement>("#parent");
    let unlocked = false;
    child.addEventListener("click", () => { if (unlocked) opensListOnce(child); });
    const opensListOnce = (trigger: HTMLElement): void => {
      document.body.insertAdjacentHTML("beforeend", '<div id="list" role="listbox"><div id="sub" role="option">Hot</div></div>');
      find<HTMLElement>("#sub").addEventListener("click", () => { trigger.textContent = "Hot"; find("#list").remove(); });
    };
    opensList(parent, '<div role="option">New</div>', (option) => { parent.textContent = option.textContent; unlocked = true; });

    const result = await fillPage(settingsWith());

    expect(child.textContent).toBe("Hot");
    expect(result).toMatchObject({ filled: 2, errors: 0 });
  }, 12000);

  it("reports a list that stayed empty once, after retrying", async () => {
    render('<button id="field" type="button" role="combobox" aria-label="Campaign">Pick</button>');

    const result = await fillPage(settingsWith());

    expect(result.errors).toBe(1);
    expect(result.details.filter((line) => line.startsWith("Could not select"))).toHaveLength(1);
  }, 12000);
});

describe("visibility", () => {
  const box = (element: HTMLElement, rect: Partial<DOMRect>): void => {
    element.getBoundingClientRect = () => ({ width: 100, height: 20, left: 10, right: 110, top: 10, bottom: 30, ...rect }) as DOMRect;
  };

  it("counts a field scrolled above the top of its container as visible", () => {
    render('<div id="scroller"><input id="field"></div>');
    box(find<HTMLElement>("#field"), { top: -300, bottom: -280 });
    find<HTMLElement>("#scroller").scrollTop = 500;
    expect(isVisible(find<HTMLElement>("#field"))).toBe(true);
  });

  it("still counts a field parked off screen on purpose as hidden", () => {
    render('<input id="field">');
    box(find<HTMLElement>("#field"), { left: -9999, right: -9899 });
    expect(isVisible(find<HTMLElement>("#field"))).toBe(false);
  });
});

describe("recognising controls", () => {
  it("finds an Element UI select, which is only a read-only input", () => {
    render('<div class="el-select"><div class="el-input"><input readonly class="el-input__inner" placeholder="Select State"></div></div>');
    const input = find<HTMLElement>("input");
    expect(isCombobox(input)).toBe(true);
    expect(collectFields(document)).toEqual([input]);
  });

  it("keeps treating any other read-only input as read-only", () => {
    render('<input id="field" readonly placeholder="State">');
    expect(isCombobox(find<HTMLElement>("#field"))).toBe(false);
  });

  it("trusts a label beside the field over a copied placeholder, even when its for names nothing", () => {
    render('<div><label for="text">Street Number And Name</label><input id="field" placeholder="Apt or Suite Number"></div>');
    expect(classifyField(find<HTMLElement>("#field"))).toBe("street");
  });

  it("does not borrow a label that belongs to another field", () => {
    render('<div><label for="other">Email</label><button id="other" type="button"></button><input id="field" placeholder="Company"></div>');
    expect(classifyField(find<HTMLElement>("#field"))).toBe("company");
  });

  it("skips a phone field's flag button, which is not the form's country", () => {
    render('<div><div><button id="flag" type="button" role="combobox" aria-label="Country selector"></button></div><input type="tel"></div>');
    expect(classifyField(find<HTMLElement>("#flag"))).toBe("skip");
  });

  it("still fills a real country dropdown beside a phone field", () => {
    render('<div><div><button id="country" type="button" role="combobox" aria-label="Country"></button></div><input type="tel"></div>');
    expect(classifyField(find<HTMLElement>("#country"))).toBe("country");
  });
});

describe("a dropdown that stays disabled", () => {
  it.each([true, false])("is skipped quietly, with dependent dropdowns %s", async (fillDependentDropdowns) => {
    render('<button id="status" type="button" role="combobox" aria-label="Vendor Company Status" disabled>Inactive</button>');

    const result = await fillPage(settingsWith({ fillDependentDropdowns, fillExisting: true }));

    expect(result).toMatchObject({ filled: 0, errors: 0 });
    expect(find<HTMLElement>("#status").textContent).toBe("Inactive");
  });
});
