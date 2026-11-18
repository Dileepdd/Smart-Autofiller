import { localeFile, needsLocaleFile } from "../generators/localeRegistry";
import { createProfile, Profile } from "../generators/profile";
import { getEffectiveSettings } from "../shared/profiles";
import { AutofillSettings } from "../shared/types";

/**
 * The options page's preview card: one person generated from the current settings. It ships as
 * its own file, loaded only on the options page, so the popup does not carry the data generator.
 */

const loaded = new Set<string>();

/** Name data for most languages is a separate file, loaded here once, as a fill would load it. */
function loadLanguage(settings: AutofillSettings): Promise<void> {
  const code = settings.nameRegion === "country" ? settings.country : settings.nameRegion;
  if (!needsLocaleFile(code) || loaded.has(code)) return Promise.resolve();
  loaded.add(code);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = localeFile(code);
    script.onload = script.onerror = () => resolve();
    document.head.append(script);
  });
}

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function fact(label: string, value: string): HTMLElement {
  const box = element("div", "preview-fact");
  box.append(element("span", "", label), element("strong", "", value));
  return box;
}

function card(profile: Profile): HTMLElement {
  const box = element("div", "preview-card");
  const top = element("div", "preview-top");
  top.append(element("span", "preview-brand", "Smart Autofill"), element("span", "preview-tag", "Test data"));
  const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`.toUpperCase();
  const facts = element("div", "preview-facts");
  facts.append(fact("Age", String(profile.age)), fact("Experience", `${profile.experience} years`), fact("Gender", profile.gender));
  box.append(
    top,
    element("div", "preview-avatar", initials),
    element("p", "preview-name", profile.fullName),
    element("p", "preview-email", profile.email),
    element("p", "preview-place", [profile.city, profile.country].filter(Boolean).join(", ")),
    facts
  );
  return box;
}

async function render(root: HTMLElement): Promise<void> {
  const settings = await getEffectiveSettings();
  await loadLanguage(settings);
  root.querySelector(".preview-card")?.replaceWith(card(createProfile(settings)));
}

function mount(): void {
  const root = document.getElementById("preview");
  if (!root) return;
  const another = element("button", "secondary", "Show another person");
  another.type = "button";
  another.addEventListener("click", () => void render(root));
  root.replaceChildren(element("h2", "preview-title", "Preview"), element("div", "preview-card"), another,
    element("p", "hint", "Each fill creates a new person within these settings."));
  void render(root);
  chrome.storage.onChanged.addListener((changes) => {
    if (Object.keys(changes).some((key) => key.startsWith("smartAutofillSettings") || key.startsWith("smartAutofillProfiles"))) void render(root);
  });
}

mount();
