import { showDashboard } from "./dashboard";

const DASHBOARD = "dashboard";

/** One line under each section's title, saying what it controls. */
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  "Identity": "Choose who your generated test person is.",
  "Region": "Country and language of the data, and the formats for phones, dates, currency and addresses.",
  "Data generation": "How free text, numbers and identifiers such as employee IDs are generated.",
  "Filling behavior": "What a fill touches, and how dropdowns, radio buttons and checkboxes are chosen.",
  "Custom rules": "Fixed values for any field whose label contains a keyword.",
  "Saved profiles": "Sets of values for different environments or user types, switched in one click.",
  "Share and back up": "Export or import your setup, and choose the format for bug reports.",
  "Advanced": "Reports, highlighting and options for power users."
};

/** Simple line icons, drawn on a 16-pixel grid. */
const ICONS: Readonly<Record<string, string>> = {
  "Dashboard": '<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>',
  "Identity": '<circle cx="8" cy="5.5" r="2.75"/><path d="M2.75 14c.6-2.7 2.7-4.2 5.25-4.2s4.65 1.5 5.25 4.2"/>',
  "Region": '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.7 2.7 3.7 2.7 6S9.8 12.3 8 14C6.2 12.3 5.3 10.3 5.3 8S6.2 3.7 8 2Z"/>',
  "Data generation": '<ellipse cx="8" cy="3.75" rx="5" ry="1.75"/><path d="M3 3.75v8.5c0 1 2.2 1.75 5 1.75s5-.8 5-1.75v-8.5M3 8c0 1 2.2 1.75 5 1.75S13 9 13 8"/>',
  "Filling behavior": '<path d="M2.5 4h7M2.5 8h11M2.5 12h5M12 2.5v3M10.5 4h3"/>',
  "Custom rules": '<path d="M2.5 4.5h5M10.5 4.5h3M2.5 11.5h2M7.5 11.5h6"/><circle cx="9" cy="4.5" r="1.5"/><circle cx="6" cy="11.5" r="1.5"/>',
  "Saved profiles": '<path d="M4 2.5h8v11L8 10.75 4 13.5Z"/>',
  "Share and back up": '<path d="M8 10V2.5M5 5.25 8 2.5l3 2.75M3 9.5v3.25c0 .4.3.75.75.75h8.5c.4 0 .75-.35.75-.75V9.5"/>',
  "Advanced": '<path d="M8 2v2.25M8 11.75V14M2 8h2.25M11.75 8H14M3.75 3.75l1.6 1.6M10.65 10.65l1.6 1.6M3.75 12.25l1.6-1.6M10.65 5.35l1.6-1.6"/>'
};

/** Parsed as SVG rather than set as HTML, so no markup string is ever written into the page. */
function icon(name: string): Node {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  return document.importNode(new DOMParser().parseFromString(markup, "image/svg+xml").documentElement, true);
}

/** Button groups that stand in for short selects. The select stays, hidden, so saving works as before. */
const SEGMENTED = ["gender"];

function segmented(select: HTMLSelectElement): void {
  const group = document.createElement("div");
  group.className = "segmented";
  group.setAttribute("role", "radiogroup");
  const label = select.labels?.[0];
  if (label) {
    label.id ||= `${select.id}-label`;
    group.setAttribute("aria-labelledby", label.id);
  }
  for (const option of Array.from(select.options)) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.dataset.value = option.value;
    button.textContent = option.text;
    button.addEventListener("click", () => {
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      refreshOptionsLayout();
    });
    group.append(button);
  }
  select.classList.add("visually-hidden");
  select.tabIndex = -1;
  select.after(group);
}

/** Brings the button groups in line with their selects, after settings load or are imported. */
export function refreshOptionsLayout(): void {
  for (const id of SEGMENTED) {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    const group = select?.nextElementSibling;
    if (!select || !group?.classList.contains("segmented")) continue;
    for (const button of Array.from(group.querySelectorAll<HTMLButtonElement>("button"))) {
      button.setAttribute("aria-checked", String(button.dataset.value === select.value));
    }
  }
}

/**
 * On the full options page, the settings sections become a sidebar with one section shown at a
 * time, a dashboard first and a live preview beside. The popup keeps its compact list of sections.
 */
export function initOptionsLayout(): void {
  const view = document.getElementById("settingsView");
  const form = document.getElementById("settingsForm");
  const dashboard = document.getElementById("dashboard");
  if (!view || !form || !dashboard) return;

  const sections = Array.from(form.querySelectorAll<HTMLDetailsElement>(":scope > details"));
  const nav = document.createElement("nav");
  nav.className = "side-nav";
  nav.setAttribute("aria-label", "Settings sections");

  const entries = [
    { id: DASHBOARD, title: "Dashboard" },
    ...sections.map((section, index) => {
      section.dataset.section ||= `section-${index}`;
      return { id: section.dataset.section, title: section.querySelector("summary")?.textContent?.trim() ?? "Section" };
    })
  ];

  const preview = document.createElement("aside");
  preview.id = "preview";
  preview.className = "preview";

  const show = (id: string): void => {
    dashboard.hidden = id !== DASHBOARD;
    form.hidden = id === DASHBOARD;
    preview.hidden = id === DASHBOARD;
    for (const section of sections) {
      section.hidden = section.dataset.section !== id;
      section.open = true;
    }
    for (const button of Array.from(nav.querySelectorAll<HTMLButtonElement>("button"))) button.setAttribute("aria-current", String(button.dataset.target === id));
    if (id === DASHBOARD) void showDashboard(dashboard);
  };

  for (const { id, title } of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.target = id;
    button.append(icon(title), title);
    button.addEventListener("click", () => show(id));
    nav.append(button);
  }

  // Each section is always open here: its heading names it rather than folding it away.
  for (const section of sections) {
    const summary = section.querySelector("summary");
    summary?.addEventListener("click", (event) => event.preventDefault());
    const description = DESCRIPTIONS[summary?.textContent?.trim() ?? ""];
    if (summary && description) {
      const note = document.createElement("p");
      note.className = "section-desc";
      note.textContent = description;
      summary.after(note);
    }
  }

  for (const id of SEGMENTED) {
    const select = document.getElementById(id);
    if (select instanceof HTMLSelectElement) segmented(select);
  }

  view.insertBefore(nav, view.querySelector(".options-main"));
  view.querySelector(".options-main")?.append(preview);
  const script = document.createElement("script");
  script.src = "preview.js";
  document.body.append(script);
  show(DASHBOARD);
  // A fill in another tab updates the dashboard while it is open.
  chrome.storage.onChanged.addListener((changes) => {
    if ("smartAutofillStats" in changes && !dashboard.hidden) void showDashboard(dashboard);
  });
}
