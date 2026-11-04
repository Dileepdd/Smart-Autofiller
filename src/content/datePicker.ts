import { delay, waitFor } from "./waiting";
import { press, writeSelect, writeValue } from "./writers";

/** Long enough for a picker to parse a typed value on blur and discard it if the format is wrong. */
const PARSE_SETTLE_MS = 80;
const OPEN_TIMEOUT_MS = 500;

/**
 * Tries each format until the field keeps one. Date pickers clear text they cannot parse,
 * which identifies the right format without pressing Enter, since Enter could submit the form.
 */
export async function writeFirstAcceptedDate(input: HTMLInputElement, candidates: string[]): Promise<boolean> {
  for (const candidate of candidates) {
    writeValue(input, candidate);
    await delay(PARSE_SETTLE_MS);
    if (input.value !== "") return true;
  }
  return false;
}

export const isFlatpickr = (element: HTMLElement): boolean => element.matches("input.flatpickr-input");

/**
 * flatpickr ignores typed text: a write shows in the input but never reaches the component.
 * So this uses its calendar, the same way a person would.
 */
export async function pickFlatpickrDate(input: HTMLInputElement, date: Date): Promise<boolean> {
  const openCalendar = (): HTMLElement | null => input.ownerDocument.querySelector<HTMLElement>(".flatpickr-calendar.open");
  input.dispatchEvent(new FocusEvent("focus"));
  press(input);
  if (!(await waitFor(() => openCalendar() !== null, OPEN_TIMEOUT_MS))) return false;

  const calendar = openCalendar();
  const year = calendar?.querySelector<HTMLInputElement>(".cur-year");
  const month = calendar?.querySelector<HTMLSelectElement>(".flatpickr-monthDropdown-months");
  if (!calendar || !year || !month) return false;
  writeValue(year, String(date.getFullYear()));
  // flatpickr applies a typed year on this event rather than on input.
  year.dispatchEvent(new Event("increment", { bubbles: true }));
  writeSelect(month, String(date.getMonth()));
  await delay(PARSE_SETTLE_MS);

  const days = calendar.querySelectorAll<HTMLElement>(".flatpickr-day:not(.flatpickr-disabled):not(.prevMonthDay):not(.nextMonthDay)");
  const day = Array.from(days).find((cell) => cell.textContent?.trim() === String(date.getDate()));
  // Each day's label names its full date, which proves the calendar reached the right year.
  if (!day?.getAttribute("aria-label")?.includes(String(date.getFullYear()))) return false;
  press(day);
  await delay(PARSE_SETTLE_MS);
  return input.value !== "";
}
