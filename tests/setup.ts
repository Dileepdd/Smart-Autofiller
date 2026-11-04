import { beforeEach, vi } from "vitest";

// happy-dom has no layout engine, so every element would otherwise measure 0x0 and count as hidden.
beforeEach(() => {
  document.body.innerHTML = "";
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 20));
});
