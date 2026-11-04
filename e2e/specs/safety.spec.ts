import { expect, fillThroughPopup, pageState, test } from "../support/harness";

test.describe("safety", () => {
  test("never submits, even through a dropdown trigger that defaults to submit", async ({ extension, open }) => {
    const page = await open("safety");

    await fillThroughPopup(extension, page);

    expect(await pageState(page)).toMatchObject({ submits: 0, submitClicks: 0, dangerClicks: 0, url: page.url() });
  });

  test("stops a page handler that submits during the fill, then lets the user submit", async ({ extension, open }) => {
    const page = await open("autosubmit");

    const result = await fillThroughPopup(extension, page);

    expect(result.details.join()).toContain("Blocked a form submission");
    expect((await pageState(page)).submits).toBe(0);

    await page.click("#send");
    expect((await pageState(page)).submits).toBe(1);
  });

  test("makes no network requests while filling", async ({ extension, open }) => {
    const page = await open("react");
    const requests: string[] = [];
    extension.context.on("request", (request) => requests.push(request.url()));

    await fillThroughPopup(extension, page);

    expect(requests.filter((url) => !url.startsWith("chrome-extension://"))).toEqual([]);
  });

  test("leaves hidden, disabled, readonly and existing values untouched", async ({ extension, open }) => {
    const page = await open("plain");

    await fillThroughPopup(extension, page);

    expect(await pageState(page)).toMatchObject({ ro: "locked", dis: "", hid: "", off: "", keep: "KEEP", fs: "", card: "", search: "", c1: false, c2: true });
  });

  test("replaces existing values only when asked, and never readonly ones", async ({ extension, open }) => {
    const page = await open("plain");

    await fillThroughPopup(extension, page, { fillExisting: true });

    const state = await pageState(page);
    expect(state.keep).not.toBe("KEEP");
    expect(state.ro).toBe("locked");
  });

  test("handles a large form quickly", async ({ extension, open }) => {
    const page = await open("big");
    const started = Date.now();

    const result = await fillThroughPopup(extension, page);

    expect(result).toMatchObject({ filled: 2020, errors: 0 });
    expect(await pageState(page)).toEqual({ emptyInputs: 0, emptySelects: 0 });
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
