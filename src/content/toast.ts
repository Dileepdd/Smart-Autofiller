const HOST_ID = "smart-autofill-toast";
const VISIBLE_MS = 2500;

/** Set through the style property, which a page's content security policy cannot block. */
const HOST_STYLE = "all:initial;position:fixed;top:16px;right:16px;z-index:2147483647;pointer-events:none";
const NOTE_STYLE = "padding:10px 14px;border-radius:8px;background:#202124;color:#fff;font:500 13px/1.4 system-ui,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.25)";

let hideTimer: ReturnType<typeof setTimeout> | undefined;

export function filledMessage(filled: number): string {
  if (filled === 0) return "No fields filled";
  return `${filled} ${filled === 1 ? "field" : "fields"} filled`;
}

/** A brief note over the page. Its shadow root keeps the page's styles out, and it never takes a click. */
export function showToast(message: string): void {
  clearTimeout(hideTimer);
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = HOST_STYLE;
  const note = document.createElement("div");
  note.setAttribute("role", "status");
  note.style.cssText = NOTE_STYLE;
  note.textContent = message;
  host.attachShadow({ mode: "open" }).append(note);
  document.documentElement.append(host);

  hideTimer = setTimeout(() => host.remove(), VISIBLE_MS);
}
