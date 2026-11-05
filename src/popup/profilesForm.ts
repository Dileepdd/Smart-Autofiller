import { activeProfile, deleteProfile, getProfileStore, saveProfileStore, selectProfile, upsertProfile, validateProfile } from "../shared/profiles";
import { customRuleErrors, formatCustomRules, getSettings, parseCustomRules } from "../shared/settings";
import { ProfileKey, ProfileStore, TestProfile } from "../shared/types";

type Control = HTMLInputElement | HTMLSelectElement;

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const controls = (): Control[] => Array.from(document.querySelectorAll<Control>("[data-profile]"));

function showError(message?: string): void {
  const error = byId<HTMLParagraphElement>("profileError");
  error.textContent = message ?? "";
  error.hidden = !message;
}

function showEditor(profile?: TestProfile): void {
  byId<HTMLInputElement>("profileName").value = profile?.name ?? "";
  byId<HTMLTextAreaElement>("profileRules").value = formatCustomRules(profile?.customRules ?? []);
  for (const control of controls()) {
    const value = profile?.overrides[control.dataset.profile as ProfileKey];
    control.value = value === undefined ? "" : String(value);
  }
  byId("deleteProfile").hidden = !profile;
  showError();
}

function showStore(store: ProfileStore): void {
  const select = byId<HTMLSelectElement>("activeProfile");
  const none = new Option("None (global settings)", "");
  select.replaceChildren(none, ...store.profiles.map(({ id, name }) => new Option(name, id)));
  select.value = store.activeProfileId ?? "";
  showEditor(activeProfile(store));
}

function readEditor(id: string): TestProfile {
  const entries = controls().flatMap((control) => {
    const value = control.value.trim();
    if (!value) return [];
    return [[control.dataset.profile, control.type === "number" ? Number(value) : value]];
  });
  return {
    id,
    name: byId<HTMLInputElement>("profileName").value.trim(),
    overrides: Object.fromEntries(entries),
    customRules: parseCustomRules(byId<HTMLTextAreaElement>("profileRules").value)
  };
}

/** Wires the Saved profiles section. `onChange` runs after the active profile changes. */
export async function initProfiles(onChange: () => void): Promise<void> {
  showStore(await getProfileStore());

  const commit = async (store: ProfileStore): Promise<void> => {
    await saveProfileStore(store);
    showStore(store);
    onChange();
  };

  byId("activeProfile").addEventListener("change", async (event) => {
    event.stopPropagation();
    const id = byId<HTMLSelectElement>("activeProfile").value || null;
    await commit(selectProfile(await getProfileStore(), id));
  });

  byId("saveProfile").addEventListener("click", async () => {
    const store = await getProfileStore();
    const profile = readEditor(store.activeProfileId ?? crypto.randomUUID());
    const ruleError = customRuleErrors(byId<HTMLTextAreaElement>("profileRules").value)[0];
    const problem = ruleError ?? validateProfile(profile, store, await getSettings());
    if (problem) return showError(problem);
    await commit(upsertProfile(store, profile));
  });

  byId("deleteProfile").addEventListener("click", async () => {
    const store = await getProfileStore();
    if (store.activeProfileId) await commit(deleteProfile(store, store.activeProfileId));
  });
}
