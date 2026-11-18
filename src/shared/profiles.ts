import { getSettings, validateSettings } from "./settings";
import { AutofillSettings, PROFILE_KEYS, ProfileStore, TestProfile } from "./types";

const KEY = "smartAutofillProfiles";

const EMPTY_STORE: ProfileStore = { profiles: [], activeProfileId: null };

export async function getProfileStore(): Promise<ProfileStore> {
  const stored = await chrome.storage.local.get(KEY);
  return { ...EMPTY_STORE, ...(stored[KEY] as Partial<ProfileStore> | undefined) };
}

export async function saveProfileStore(store: ProfileStore): Promise<void> {
  await chrome.storage.local.set({ [KEY]: store });
}

export const activeProfile = (store: ProfileStore): TestProfile | undefined =>
  store.profiles.find((profile) => profile.id === store.activeProfileId);

/** Blank overrides fall back to the global value, and only profile keys can change. */
export function applyProfile(settings: AutofillSettings, profile?: TestProfile): AutofillSettings {
  if (!profile) return settings;
  const overrides = Object.fromEntries(PROFILE_KEYS.flatMap((key) => {
    const value = profile.overrides[key];
    return value === undefined || value === "" ? [] : [[key, value]];
  }));
  return { ...settings, ...overrides, customRules: [...profile.customRules, ...settings.customRules] };
}

/** The settings a fill should use: the global ones with the active profile applied. */
export async function getEffectiveSettings(): Promise<AutofillSettings> {
  const [settings, store] = await Promise.all([getSettings(), getProfileStore()]);
  return applyProfile(settings, activeProfile(store));
}

export function validateProfile(profile: TestProfile, store: ProfileStore, settings: AutofillSettings): string | undefined {
  const name = profile.name.trim().toLowerCase();
  if (!name) return "Give the profile a name.";
  if (store.profiles.some(({ id, name: other }) => id !== profile.id && other.trim().toLowerCase() === name)) {
    return `A profile named "${profile.name.trim()}" already exists.`;
  }
  return validateSettings(applyProfile(settings, profile));
}

/** Adds or replaces a profile, and makes it active. */
export const upsertProfile = (store: ProfileStore, profile: TestProfile): ProfileStore => ({
  activeProfileId: profile.id,
  profiles: store.profiles.some(({ id }) => id === profile.id)
    ? store.profiles.map((existing) => (existing.id === profile.id ? profile : existing))
    : [...store.profiles, profile]
});

export const deleteProfile = (store: ProfileStore, id: string): ProfileStore => ({
  activeProfileId: store.activeProfileId === id ? null : store.activeProfileId,
  profiles: store.profiles.filter((profile) => profile.id !== id)
});

const PROFILE_KEY_SET = new Set<string>(PROFILE_KEYS);

/** Keeps only well-formed profiles from a file, with only the values a profile may set. */
export function sanitizeProfiles(value: unknown): TestProfile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): TestProfile[] => {
    if (typeof item !== "object" || item === null) return [];
    const { id, name, overrides, customRules } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof name !== "string" || !name.trim()) return [];
    const safeOverrides = typeof overrides === "object" && overrides !== null
      ? Object.fromEntries(Object.entries(overrides).filter(([key, entry]) => PROFILE_KEY_SET.has(key) && (typeof entry === "string" || typeof entry === "number")))
      : {};
    const rules = Array.isArray(customRules)
      ? customRules.filter((rule): rule is { match: string; value: string } =>
        typeof rule === "object" && rule !== null && typeof rule.match === "string" && typeof rule.value === "string")
      : [];
    return [{ id, name: name.trim(), overrides: safeOverrides, customRules: rules }];
  });
}

export const selectProfile = (store: ProfileStore, id: string | null): ProfileStore => ({
  ...store,
  activeProfileId: store.profiles.some((profile) => profile.id === id) ? id : null
});
