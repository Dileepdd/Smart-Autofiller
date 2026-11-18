import { afterEach, describe, expect, it, vi } from "vitest";
import { collectFields } from "../src/content/detector";
import { filledMessage, showToast } from "../src/content/toast";

const host = (): HTMLElement | null => document.getElementById("smart-autofill-toast");
const shown = (): string | null | undefined => host()?.shadowRoot?.querySelector("[role=status]")?.textContent;

afterEach(() => {
  vi.useRealTimers();
  host()?.remove();
});

describe("fill message", () => {
  it.each([[0, "No fields filled"], [1, "1 field filled"], [7, "7 fields filled"]])("for %i fields says %s", (count, message) => {
    expect(filledMessage(count)).toBe(message);
  });
});

describe("toast", () => {
  it("shows the message, then removes itself", () => {
    vi.useFakeTimers();
    showToast("7 fields filled");
    expect(shown()).toBe("7 fields filled");

    vi.advanceTimersByTime(2500);

    expect(host()).toBeNull();
  });

  it("replaces an earlier toast and keeps the newer one on screen for its full time", () => {
    vi.useFakeTimers();
    showToast("first");
    vi.advanceTimersByTime(2000);
    showToast("second");
    vi.advanceTimersByTime(2000);

    expect(document.querySelectorAll("#smart-autofill-toast")).toHaveLength(1);
    expect(shown()).toBe("second");
  });

  it("cannot be clicked, so it never covers a control", () => {
    showToast("7 fields filled");
    expect(host()?.style.pointerEvents).toBe("none");
  });

  it("is not treated as a field", () => {
    showToast("7 fields filled");
    expect(collectFields(document)).toEqual([]);
  });
});
