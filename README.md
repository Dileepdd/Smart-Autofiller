# Smart Autofill – QA Test Data

A local-first Chrome Manifest V3 extension built with TypeScript and Faker.js. It generates test data in the browser; no API key or remote service is required.

## Requirements

- Node.js 20+
- Google Chrome

## Install and build

```bash
npm install
npm run typecheck
npm run build
```

The unpacked extension is generated in `dist/`.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose this project's `dist` folder.
5. Open any normal website.
6. Click the Smart Autofill extension icon, configure rules, and click **Fill entire page**.

After changing source code, run `npm run build`, then click Reload on the extension card in `chrome://extensions`.

## How a fill works

One click runs this pipeline. It repeats for fields revealed by earlier selections, up to four passes.

| Step | Module | What it does |
|---|---|---|
| Detect | `content/detector.ts` | Finds fields in the page, open shadow roots and same-origin iframes |
| Understand | `content/context.ts`, `content/classifier.ts` | Weighs `autocomplete`, labels, ARIA, names, placeholders and nearby text; a parent shared with other fields is ignored |
| Generate | `generators/profile.ts`, `generators/values.ts`, `generators/locales.ts` | Builds one coherent profile, then fits each value to the field's own limits |
| Dropdowns | `content/dropdown.ts`, `content/customDropdown.ts` | Fills Country → State → City first, waiting up to 2.5 seconds for dependent lists |
| Write | `content/writers.ts` | Sends the events frameworks expect, including focus and blur |
| Report | `content/filler.ts` | Checks values stuck, and lists problems in the popup |

To add a field type, add it to `FieldKind` and `RULES` in `classifier.ts`. The compiler then requires a matching entry in `GENERATORS` in `values.ts`.

## What it fills

- Text fields, textareas, native selects, `contenteditable` regions and date, time, month and week inputs.
- Radio groups: one option per group, chosen by the dropdown setting.
- Checkboxes: only `required` ones, so optional marketing and consent boxes stay unticked.
- ARIA dropdowns (`role=combobox`, `aria-haspopup=listbox`) and type-ahead comboboxes.

## Rules

- Email domain, domain suffix, age range and experience range.
- Country (US, India, UK, Canada, Australia), which sets location, phone and tax ID formats.
- Phone format and date format. A text field's own placeholder, such as `dd/mm/yyyy`, takes priority.
- Dropdown preference and whether to replace existing values.
- Custom rules, one `keyword = value` per line, for example `employee id = EMP-1001` or `nickname = {firstName}`. Tokens are the `Profile` fields in `generators/profile.ts`. A custom rule also selects the matching option in a dropdown.

## What it leaves alone

- Disabled, readonly and `aria-readonly` fields, and fields in a disabled `fieldset`.
- Hidden fields: `display: none`, `visibility: hidden`, zero-size, off-screen or under `aria-hidden`.
- Fields that already have a value, unless **Replace fields that already have values** is on.
- Search boxes, payment card fields, one-time codes and captchas. A custom rule can override this.
- File, color and range inputs.

It never submits a form. In custom dropdowns it only clicks the trigger and option elements.

## Tested compatibility

Checked in Chromium 156 with the built extension. Each result was read from the framework's own state, not just the DOM.

| Tested | Result |
|---|---|
| Plain HTML, shadow DOM, same-origin iframes | Works |
| React controlled inputs, selects, checkboxes | Works |
| Vue `v-model`, including `.lazy` and `.number` | Works |
| Angular reactive forms, including `touched` and validity | Works |
| Dependent dropdowns in React, Vue and Angular | Works |
| MUI TextField, Select, Autocomplete | Works |
| react-select, Headless UI Listbox, Ant Design Input and Select | Works |
| Ant Design DatePicker | **Not filled**; reported as an error |

These are local test pages, not a guarantee for every site. The toolbar click and `activeTab` grant have not been exercised automatically.

## Known limitations

- Cross-origin iframes cannot be reached, which includes most hosted payment and embedded forms.
- Closed shadow roots cannot be reached.
- Date picker widgets that need a calendar click or Enter may discard typed values. Enter is never pressed, because it can submit a form.
- A dropdown library that uses neither ARIA roles nor a known pattern is reported as an error.
- jQuery-style widgets such as Select2 hide the real `<select>`, so they are skipped as hidden.
- Rich text editors such as Quill or ProseMirror may ignore direct `contenteditable` writes.
- Input masks that need individual keystrokes may reformat or reject values.
- A custom dropdown's placeholder is only recognised when it reads like "Select…" or "Choose…". Other placeholder text can look like a value, so that dropdown is skipped.
- Location data covers a few regions and cities per country. An unsupported country selected by a page keeps its name, while other location fields stay as generated.
- Names come from Faker's English data for every country.
- Tax IDs match each country's format but are not checksum-valid. They are test data, not real identifiers.
- A disabled list that never loads adds up to 2.5 seconds to a fill.
- The extension cannot run on Chrome internal pages or the Chrome Web Store.

## Privacy and safety

All generation runs locally in the browser. Settings are stored with `chrome.storage.local`. The extension makes no network requests, does not send form content anywhere and never clicks Submit.

## Development

```bash
npm run watch
```

The watch command rebuilds JavaScript when source files change. Reload the extension in Chrome after rebuilding.

```bash
npm test
```

Tests run in happy-dom, which has no layout engine and does not load iframes, so they cover logic rather than real-browser behavior.
