# Smart Autofill

A Chrome extension for developers and QA engineers. One click fills a whole form with realistic, connected test data. It runs entirely in the browser, with no API key or remote service.

## Requirements

- Node.js 22.12 or later
- Google Chrome or another Chromium browser

## Install and build

```bash
npm install
npm run build
```

The unpacked extension is generated in `dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` folder.
5. Open any normal website, click the Smart Autofill icon, and click **Fill Entire Page**.

After changing source code, run `npm run build`, then click Reload on the extension card.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Builds the extension into `dist/` |
| `npm run watch` | Rebuilds when source files change |
| `npm run typecheck` | Type-checks `src/` and `tests/` |
| `npm test` | Runs unit tests in happy-dom |
| `npm run test:e2e` | Builds, then runs the real-browser tests |

## Tests

Unit tests live in `tests/`. They run in happy-dom, which has no layout engine and does not load iframes, so they cover logic rather than browser behavior.

Browser tests live in `e2e/`, a separate package, so Playwright and the framework test apps never enter the extension's dependency tree. First-time setup:

```bash
npm run e2e:setup
```

Then run them:

```bash
npm run test:e2e
```

Each test loads the unmodified `dist/` into Chromium, runs the real toolbar action, and presses **Fill Entire Page** in the real popup. The toolbar action comes from Chrome's `Extensions.triggerAction` DevTools command, so `activeTab` is granted the same way a click grants it, with no added permissions. Results are read from each framework's own state, not just the DOM.

A browser window opens during the run, because popups need a real toolbar. On a machine without a display, run `xvfb-run npm run test:e2e`. Keep the window undisturbed: a popup closes when it loses focus.

## How a fill works

One click runs this pipeline. It repeats for fields revealed by earlier selections, up to four passes.

| Step | Module | What it does |
|---|---|---|
| Detect | `content/detector.ts` | Finds fields in the page, open shadow roots and same-origin iframes |
| Understand | `content/context.ts`, `content/classifier.ts` | Weighs `autocomplete`, labels, ARIA, names, placeholders and nearby text; a parent shared with other fields is ignored |
| Generate | `generators/profile.ts`, `generators/values.ts`, `generators/locales.ts` | Builds one coherent profile, then fits each value to the field's own limits |
| Dropdowns | `content/dropdown.ts`, `content/customDropdown.ts` | Fills Country → State → City first, waiting up to 2.5 seconds for dependent lists |
| Dates | `content/datePicker.ts` | Tries date formats until a picker keeps one, or uses the calendar |
| Write | `content/writers.ts` | Sends the events frameworks expect, including focus and blur |
| Report | `content/filler.ts` | Checks values stuck, and lists problems in the popup |

To add a field type, add it to `FieldKind` and `RULES` in `classifier.ts`. The compiler then requires a matching entry in `GENERATORS` in `values.ts`.

## What it fills

- Text fields, textareas, native selects, `contenteditable` regions and date, time, month and week inputs.
- Radio groups: one option per group, chosen by the dropdown setting.
- Checkboxes: only `required` ones, so optional marketing and consent boxes stay unticked.
- ARIA dropdowns (`role=combobox`, `aria-haspopup=listbox`) and type-ahead comboboxes.
- Date pickers: see the compatibility table below.

## Settings

Settings save automatically, persist in `chrome.storage.local` and apply on every site.

| Setting | Default |
|---|---|
| Email domain | `example.com` |
| Domain suffix | `.com` |
| Age range | 18 to 100 |
| Experience range | 0 to 20 |
| Country (India, United States, United Kingdom, Canada, Australia) | India |
| Phone format | National |
| Date format | `YYYY-MM-DD`; a text field's own placeholder, such as `dd/mm/yyyy`, takes priority |
| Dropdowns | First valid option |
| Replace existing values | Off |

Country sets location, phone and tax ID formats: EIN (US), PAN and GSTIN (India), VAT (UK), Business Number (Canada) and ABN (Australia).

Values also adapt to the field. `maxlength`, `pattern`, `min`, `max`, `minlength` and `type="number"` are respected, and a shortened phone number keeps its local digits, so the same number appears across phone fields.

Custom rules take one `keyword = value` per line, for example `employee id = EMP-1001` or `nickname = {firstName}`. Tokens are the `Profile` fields in `generators/profile.ts`. A custom rule also selects the matching option in a dropdown.

## What it leaves alone

- Disabled, readonly and `aria-readonly` fields, and fields in a disabled `fieldset`. flatpickr is the one exception: its input is always readonly, so its calendar is used.
- Hidden fields: `display: none`, `visibility: hidden`, zero-size, off-screen, `inert` or under `aria-hidden`.
- Fields that already have a value, unless **Replace existing values** is on. Ticked checkboxes and chosen radios are never changed.
- Search boxes, payment card fields, one-time codes and captchas. A custom rule can override this.
- File, color and range inputs.

## Safety

- It never submits a form. It never presses Enter.
- In custom dropdowns and calendars it only clicks the trigger and the option or day elements. A trigger that would submit a form or follow a link receives no click.
- If a page's own script tries to submit during a fill, the submission is stopped and reported. This cannot catch `form.submit()`, which fires no event, or forms inside shadow roots and iframes.
- It makes no network requests and asks only for `activeTab`, `scripting` and `storage`.
- It only reaches a page after you click the toolbar icon on that tab.
- Generated values, including passwords, never appear in the report.

Filling fires the page's own `change` handlers, as typing would. A page that acts on those handlers will still act, so use this on test environments.

## Tested compatibility

Checked by `npm run test:e2e` in Playwright's Chromium with the built extension.

| Tested | Result |
|---|---|
| Plain HTML, shadow DOM, same-origin iframes | Works |
| React controlled inputs, selects, checkboxes | Works |
| Vue `v-model`, including `.lazy` and `.number` | Works |
| Angular reactive forms, including `touched` and validity | Works |
| Dependent dropdowns in React, Vue and Angular | Works |
| MUI TextField, Select, Autocomplete | Works |
| react-select, Headless UI Listbox, Ant Design Input and Select | Works |
| Date pickers: Ant Design, MUI X, react-datepicker, Element Plus | Works, by typing |
| Date picker: flatpickr | Works, through its calendar |
| Names, email, company, domain, website, tax IDs, phones, postal codes and addresses for all five countries | Works |
| Cross-origin iframes | Not reachable |

These are local test pages, not a guarantee for every site.

## Known limitations

- Cross-origin iframes cannot be reached, which includes most hosted payment and embedded forms.
- Closed shadow roots cannot be reached.
- A date picker that accepts none of the tried formats is reported as unsupported. A picker that keeps a value it never applied would look filled; flatpickr did this until it got its own handling.
- If a picker accepts both day-first and month-first dates, a date with a day of 12 or less could have its day and month swapped. It stays a valid date.
- A dropdown library that uses neither ARIA roles nor a known pattern is reported as an error.
- jQuery-style widgets such as Select2 hide the real `<select>`, so they are skipped as hidden.
- Rich text editors such as Quill or ProseMirror may ignore direct `contenteditable` writes.
- Input masks that need individual keystrokes may reformat or reject values.
- A custom dropdown's placeholder is only recognised when it reads like "Select…" or "Choose…". Other placeholder text can look like a value, so that dropdown is skipped.
- Location data covers a few regions and cities per country. An unsupported country selected by a page keeps its name, while other location fields stay as generated.
- Names come from Faker's English data for every country.
- Tax IDs match each country's format but are not checksum-valid. They are test data, not real identifiers.
- A `type="number"` field cannot hold letters, so UK and Canadian postal codes there are reduced to their digits.
- A disabled list that never loads adds up to 2.5 seconds to a fill. Dropdowns that never open cost up to 2 seconds each, capped at 20 seconds per pass.
- The extension cannot run on Chrome internal pages or the Chrome Web Store.
