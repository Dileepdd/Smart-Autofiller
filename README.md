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
5. Open any normal website and click the Smart Autofill icon. The page fills straight away, with no popup.

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

Each test loads the unmodified `dist/` into Chromium and runs the real toolbar action, then either checks the one-click result on the icon or presses **Fill Entire Page** in the real popup. The toolbar action comes from Chrome's `Extensions.triggerAction` DevTools command, so `activeTab` is granted the same way a click grants it, with no added permissions. Results are read from each framework's own state, not just the DOM.

A browser window opens during the run, because popups need a real toolbar. On a machine without a display, run `xvfb-run npm run test:e2e`. Keep the window undisturbed: a popup closes when it loses focus.

## How a fill works

One click runs this pipeline. It repeats for fields revealed by earlier selections, up to four passes.

| Step | Module | What it does |
|---|---|---|
| Detect | `content/detector.ts` | Finds fields in the page, open shadow roots and same-origin iframes |
| Understand | `content/context.ts`, `content/classifier.ts` | Weighs `autocomplete`, labels, ARIA, names, placeholders and nearby text; a parent shared with other fields is ignored |
| Generate | `generators/profile.ts`, `generators/values.ts`, `generators/locales.ts` | Builds one coherent profile, then fits each value to the field's own limits |
| Dropdowns | `content/dropdown.ts`, `content/customDropdown.ts` | Fills Country → State → City first, waiting up to 2.5 seconds for a dependent list to enable and up to 5 seconds for an open list to load |
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

Settings save automatically, persist in `chrome.storage.local` and apply on every site. There are two ways to reach them:

- Right-click the toolbar icon. **Fill on icon click** and **Replace existing values** are ticks in that menu, along with **Undo last fill** and, once you have saved one, **Test profile**. **Options** opens every setting.
- Open **Details** on `chrome://extensions` and choose **Extension options**.

By default one click on the toolbar icon fills the page, with no popup. The icon then shows how many fields were filled, or `!` if something needs attention. Hover over the icon for details.

With **Fill on icon click** off, the icon opens a popup with **Fill Entire Page**, the result counts and the settings.

| Section | Settings |
|---|---|
| Identity | Email domain, domain suffix, age and experience ranges, first and last name, middle name on or off, gender, username style, password pattern, company, department, job title |
| Region | Country (India by default, or United States, United Kingdom, Canada, Australia), phone format, date format, currency, address format |
| Data generation | Text style, number range, decimals, date range, company size range, and patterns for employee, customer and invoice IDs |
| Filling behavior | Dropdown, radio, multi-select and checkbox preferences, all forms or the selected form, one-click filling, replacing values, unique repeated values, dynamic fields, same-origin iframes |
| Custom rules | One `keyword = value` per line |
| Saved profiles | Named sets of values, with one active at a time |
| Advanced | Highlighting, detailed reports, reusing generated data |

Leave a name, company, department or title blank for a generated one. A text field's own date placeholder, such as `dd/mm/yyyy`, takes priority over the date format. A field's own `min` and `max` take priority over the number range, and decimals only apply where the field allows them.

"Selected form" means the form containing the focused field, or otherwise the form with the most fields.

The fill shortcut is Alt+Shift+F, which you can change at `chrome://extensions/shortcuts`.

**Undo last fill** restores text fields, selects and checkboxes. Radio buttons, custom dropdowns and calendar pickers cannot be restored safely, and the result says how many were left. Undo is lost when the page reloads.

### Saved profiles

A profile overrides country, email domain, age and experience ranges, names, company, department and job title. Blank values use the global setting. It can also hold its own custom rules, which are checked before the global ones. Everything else, such as dropdown preferences, stays global.

Select a profile in **Saved profiles** or from the toolbar icon's right-click menu. **Save profile** creates a new profile when none is active, and otherwise updates the active one.

Country sets location, phone and tax ID formats: EIN (US), PAN and GSTIN (India), VAT (UK), Business Number (Canada) and ABN (Australia).

Location already on the page wins when it stays there: a form preset to United States gets US data, whatever country is configured. A format the page spells out, such as `Format: XX-XXXXXXX` or `e.g. AB-1234`, is followed for IDs, phones and postal codes; `X` and `#` are read as digits.

Values also adapt to the field. `maxlength`, `pattern`, `min`, `max`, `minlength` and `type="number"` are respected, and a shortened phone number keeps its local digits, so the same number appears across phone fields.

Custom rules take one `keyword = value` per line, for example `employee id = EMP-{number:1000-9999}` or `nickname = {firstName}`. Keywords ignore case and must appear as whole words in the field's description. Tokens are listed in `shared/template.ts`. Rules take priority over generated values, and also select the matching option in a dropdown, but they can never reach a disabled, readonly or hidden field. Invalid rules are reported with their line number.

## What it leaves alone

- Disabled, readonly and `aria-readonly` fields, and fields in a disabled `fieldset`. flatpickr is the one exception: its input is always readonly, so its calendar is used.
- Hidden fields: `display: none`, `visibility: hidden`, zero-size, off-screen, `inert` or under `aria-hidden`.
- Fields that already have a value, when **Replace existing values** is off. Ticked checkboxes and chosen radios are never changed.
- Search boxes, payment card fields, one-time codes and captchas. A custom rule can override this.
- Site controls: anything in pagination, and anything in a page header, navigation bar or footer unless it is inside a form or dialog.
- File, color and range inputs.

## Safety

- It never submits a form. It never presses Enter.
- In custom dropdowns and calendars it only clicks the trigger and the option or day elements. A trigger that would submit a form or follow a link receives no click.
- If a page's own script tries to submit during a fill, the submission is stopped and reported. This cannot catch `form.submit()`, which fires no event, or forms inside shadow roots and iframes.
- It makes no network requests and asks only for `activeTab`, `contextMenus`, `scripting` and `storage`. Submitting forms is not configurable.
- It only reaches a page after you click the toolbar icon, or use the shortcut, on that tab.
- Generated values, including passwords, never appear in the report.

Filling fires the page's own `change` handlers, as typing would. A page that acts on those handlers will still act, so use this on test environments. **Replace existing values** is on by default, so a click overwrites what is in a form, including saved passwords. A site control built from plain `div`s with no recognisable header or navigation markup cannot be told apart from a form field.

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
| Mantine Select with server-loaded options, plain and searchable | Works |
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
- Tax IDs match each country's format but are not checksum-valid. They are test data, not real identifiers, and may fail a validator that checks them properly.
- Postal codes come from a small built-in list, so they are real for the city but few in number.
- A `type="number"` field cannot hold letters, so UK and Canadian postal codes there are reduced to their digits.
- A disabled list that never loads adds up to 2.5 seconds to a fill. Dropdowns that never open cost up to 2 seconds each, capped at 20 seconds per pass.
- The extension cannot run on Chrome internal pages or the Chrome Web Store.
