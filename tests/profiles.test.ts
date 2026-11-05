import { afterEach, describe, expect, it, vi } from "vitest";
import { activeProfile, applyProfile, deleteProfile, getEffectiveSettings, selectProfile, upsertProfile, validateProfile } from "../src/shared/profiles";
import { ProfileStore, TestProfile } from "../src/shared/types";
import { settingsWith } from "./helpers";

const profile = (overrides: Partial<TestProfile> = {}): TestProfile => ({ id: "a", name: "US Customer", overrides: {}, customRules: [], ...overrides });
const EMPTY: ProfileStore = { profiles: [], activeProfileId: null };

describe("applyProfile", () => {
  it("leaves settings alone with no active profile", () => {
    const settings = settingsWith();
    expect(applyProfile(settings)).toBe(settings);
  });

  it("overrides only what the profile defines", () => {
    const result = applyProfile(settingsWith({ emailDomain: "global.test", ageMin: 18 }), profile({ overrides: { country: "US", ageMin: 30 } }));
    expect(result).toMatchObject({ country: "US", ageMin: 30, emailDomain: "global.test" });
  });

  it("treats a blank override as the global value", () => {
    expect(applyProfile(settingsWith({ companyName: "Global" }), profile({ overrides: { companyName: "" } })).companyName).toBe("Global");
  });

  it("keeps a zero override", () => {
    expect(applyProfile(settingsWith({ experienceMin: 5 }), profile({ overrides: { experienceMin: 0 } })).experienceMin).toBe(0);
  });

  it("cannot change a global-only setting", () => {
    const sneaky = profile({ overrides: { fillOnOpen: false } as TestProfile["overrides"] });
    expect(applyProfile(settingsWith({ fillOnOpen: true }), sneaky).fillOnOpen).toBe(true);
  });

  it("checks profile rules before global ones", () => {
    const settings = settingsWith({ customRules: [{ match: "grade", value: "global" }] });
    const rules = applyProfile(settings, profile({ customRules: [{ match: "grade", value: "profile" }] })).customRules;
    expect(rules.map(({ value }) => value)).toEqual(["profile", "global"]);
  });
});

describe("profile store", () => {
  it("creates a profile and makes it active", () => {
    const store = upsertProfile(EMPTY, profile());
    expect(store.profiles).toHaveLength(1);
    expect(activeProfile(store)?.name).toBe("US Customer");
  });

  it("edits a profile in place", () => {
    const store = upsertProfile(upsertProfile(EMPTY, profile()), profile({ name: "Renamed" }));
    expect(store.profiles.map(({ name }) => name)).toEqual(["Renamed"]);
  });

  it("deletes a profile and clears it if it was active", () => {
    const store = deleteProfile(upsertProfile(EMPTY, profile()), "a");
    expect(store).toEqual({ profiles: [], activeProfileId: null });
  });

  it("keeps the active profile when another is deleted", () => {
    const store = upsertProfile(upsertProfile(EMPTY, profile({ id: "b", name: "B" })), profile());
    expect(deleteProfile(store, "b").activeProfileId).toBe("a");
  });

  it("selects a profile or none", () => {
    const store = upsertProfile(upsertProfile(EMPTY, profile()), profile({ id: "b", name: "B" }));
    expect(selectProfile(store, "a").activeProfileId).toBe("a");
    expect(selectProfile(store, null).activeProfileId).toBeNull();
  });

  it("ignores a selection that does not exist", () => {
    expect(selectProfile(upsertProfile(EMPTY, profile()), "missing").activeProfileId).toBeNull();
  });
});

describe("validateProfile", () => {
  it("requires a name", () => {
    expect(validateProfile(profile({ name: "  " }), EMPTY, settingsWith())).toContain("name");
  });

  it("rejects a duplicate name, ignoring case", () => {
    const store = upsertProfile(EMPTY, profile());
    expect(validateProfile(profile({ id: "b", name: "us customer" }), store, settingsWith())).toContain("already exists");
  });

  it("allows a profile to keep its own name", () => {
    expect(validateProfile(profile(), upsertProfile(EMPTY, profile()), settingsWith())).toBeUndefined();
  });

  it("rejects values that clash with the global settings", () => {
    expect(validateProfile(profile({ overrides: { ageMin: 200 } }), EMPTY, settingsWith({ ageMax: 100 }))).toContain("Minimum");
  });

  it("rejects an invalid email domain", () => {
    expect(validateProfile(profile({ overrides: { emailDomain: "nope" } }), EMPTY, settingsWith())).toContain("email domain");
  });
});

describe("getEffectiveSettings", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("applies the active profile from storage", async () => {
    const stored = {
      smartAutofillSettings: { emailDomain: "global.test" },
      smartAutofillProfiles: { profiles: [profile({ overrides: { country: "US" } })], activeProfileId: "a" }
    };
    vi.stubGlobal("chrome", { storage: { local: { get: async (key: keyof typeof stored) => ({ [key]: stored[key] }) } } });

    expect(await getEffectiveSettings()).toMatchObject({ country: "US", emailDomain: "global.test" });
  });
});
