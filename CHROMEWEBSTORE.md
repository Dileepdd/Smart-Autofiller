# Chrome Web Store submission

Everything needed for the Developer Dashboard, in the order the dashboard asks for it. Update this file whenever the extension's permissions, data handling or features change.

## Before you submit

**Decisions**

- [ ] **Name.** At least two other extensions are called "Smart Autofill". Ours is "Smart Autofill – QA Test Data", which is distinct but close. Decide whether to keep it.
- [ ] **Replace existing values.** This is on by default, so a click overwrites what someone has typed. Undo restores most fields, but consider turning it off by default for public users.
- [ ] **Version.** The manifest says `0.1.0`. Change it if you want the first release to be `1.0.0`.
- [ ] **Project licence.** The repository has no licence of its own, which is fine for a closed-source listing.

**Your details**

- [x] Add the publisher name, location and contact email to `PRIVACY.md`.
- [ ] Update the effective date in `PRIVACY.md` if publishing is delayed.
- [ ] Publish `PRIVACY.md` at a public web address.
- [ ] Register a developer account, pay the registration fee and turn on 2-Step Verification.
- [ ] Choose your trader or non-trader status, which affects EU users.
- [ ] Add a support email to your account.

**Manual checks in real Chrome**

These have not been tested yet, and the listing mentions them:

- [ ] A physical click on the toolbar icon
- [ ] The right-click menu on the icon: **Test data**, **Filling options**, **Clear form** and **Undo last fill**
- [ ] The right-click menu on a text field: **Fill entire form**, **Fill this field** and the value library, including in an iframe
- [ ] The shortcuts: Alt+Shift+F, Alt+Shift+D, Alt+Shift+C and Alt+Shift+M
- [ ] Installing from the release zip, not just the `dist` folder

## Package

Run `npm run package`, then upload `release/smart-autofill-<version>.zip`. Increase the version in `public/manifest.json` for every new upload.

## Store listing

**Title** (from the manifest; changing it needs a new package, so it ships with the next version)

```
Smart Autofill – Form Filler & Test Data for QA
```

**Summary** (from the manifest, 132 characters at most)

```
Form filler for QA and developers: fill any form with realistic fake test data in one click. Invalid and edge cases too. No sign-up.
```

These put the words people search for, "form filler", "fake data" and "test data", in the title and summary, which the store weighs most.

**Category:** Developer Tools

**Language:** English

**Description**

```
Testing a form usually means typing the same details again and again. Smart Autofill is a form filler and test data generator that fills the whole page in one click, so you can get straight to testing.

Built for developers, testers and QA engineers. Use it on forms you own or have permission to test.

ONE CLICK, WHOLE FORM
Click the toolbar icon and every field is filled: text, email, phone, dates, dropdowns, radio buttons and checkboxes. A short note on the page says how many fields were filled, and hovering over the icon lists any that were not.

REALISTIC, CONNECTED DATA
Every fill creates one consistent test person. The email matches the name, and the city, state, postal code and phone number all belong to the same country.

• Names, emails, phone numbers, addresses, companies, job titles and dates
• Data for 11 countries, including India, the United States and the United Kingdom
• Reads field labels in 8 languages, including English, Hindi and major European languages
• Follows the page's language automatically, or uses the one you choose
• Every US state, with matching cities and ZIP codes
• Tax ID and postal code formats for each country
• Follows format hints shown on the page, such as "Format: XX-XXXXXXX"
• Reads the page's own country selection and generates matching data

TEST MORE THAN THE HAPPY PATH
Switch the whole form to a different kind of test data in one step:

• Invalid data: wrong formats, and values just past each field's declared limits
• Minimum and maximum limits: exactly at each field's declared limits
• Edge cases: awkward but valid names, Unicode, emoji and special characters
• A label on the toolbar icon shows which mode is on, so you never test with bad data by accident
• See which fields failed the browser's validation, without submitting

RIGHT-CLICK ANY FIELD
Fill a single field, or pick from a library of problem values: text lengths, number limits, valid and invalid emails, unusual names, Unicode, whitespace, special characters and dates.

INDIAN TEST IDENTIFIERS
Generates correctly formatted sample values for Aadhaar, PAN, GSTIN, IFSC, UPI ID, bank account, passport, voter ID and driving licence fields. These are randomly generated test values for validating form behaviour. They are not real documents and must not be used as real identity details.

WORKS WITH MODERN FORMS
• Plain HTML, React, Vue and Angular forms
• Dropdowns that depend on each other, such as Country, State and City
• Custom dropdowns, including ones with a search box
• Phone number fields with a country code picker
• Common date pickers
• Same-origin iframes and shadow DOM

YOU STAY IN CONTROL
• One click on the toolbar icon, or from the right-click menu of any field
• Keyboard shortcuts to fill the form, fill one field, clear the form and switch test data
• Undo the last fill or clear the form from the icon's right-click menu
• Fill required fields only, to check how optional fields behave
• Custom rules, such as a fixed value for any field containing "customer"
• Saved test profiles for different environments or user types
• Export and import settings and profiles as a file, so a team shares one setup
• Copy the last fill for a bug report, as Markdown, plain text or JSON
• Fill from your own CSV or Excel test data, one row per fill
• Choose how dropdowns, radio buttons and checkboxes are filled

SAFE BY DESIGN
• Never submits a form or clicks a submit button
• Skips hidden, disabled and read-only fields
• Leaves payment card, one-time code and CAPTCHA fields alone by default
• Only runs when you ask it to

PRIVATE BY DESIGN
Everything happens in your browser. No account, no API key, no analytics and no network requests. Your settings stay on your device.

Some sites use forms that can't be reached, such as cross-origin iframes, and Chrome doesn't allow extensions on its own pages.
```

## Images

All files are in `store/`, except the icon.

| Dashboard field | File | Size |
|---|---|---|
| Store icon | `public/icons/icon-128.png` | 128×128 |
| Screenshot 1 | `screenshots/1-fill-form.png` | 1280×800 |
| Screenshot 2 | `screenshots/2-test-modes.png` | 1280×800 |
| Screenshot 3 | `screenshots/3-field-menu.png` | 1280×800 |
| Screenshot 4 | `screenshots/4-settings.png` | 1280×800 |
| Screenshot 5 | `screenshots/5-connected-data.png` | 1280×800 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

Retake the screenshots if the form behaviour or settings page changes, because they must match the current version.

## Privacy practices

**Single purpose**

```
Smart Autofill fills the web form on the current page with generated test data, so developers and QA engineers can test forms without typing the details by hand.
```

**Permission justifications**

`activeTab`

```
Gives temporary access to the tab where the user clicks the toolbar icon, presses the keyboard shortcut or chooses a right-click menu item, so the extension can fill the form on that page. It is used instead of broad host permissions, so the extension has no access to any other site or tab.
```

`scripting`

```
Injects the extension's packaged filling script into the active tab when the user starts a fill. The script finds the form fields and enters the generated test data. Only code inside the extension package is injected.
```

`storage`

```
Saves the user's settings, custom rules and test profiles on their device with chrome.storage.local, so preferences are kept between browser sessions. Nothing is synced or sent anywhere.
```

`contextMenus`

```
Adds options to the toolbar icon's right-click menu: test data mode, quick settings, Clear form, Undo last fill and test profile selection. Also adds items to the right-click menu of editable fields, so a tester can fill one field or insert a test value from a built-in list. These items do nothing until the user chooses one.
```

**Host permissions:** None requested.

**Remote code:** No, I am not using remote code.

**Data usage**

Chrome counts data handled on the device, even if it never leaves it, so these need declaring. Check the labels against the live form, because they may be worded differently.

| Category | Declare | Reason |
|---|---|---|
| Personally identifiable information | Yes | Existing field values are held in memory for Undo, and users can save names in settings |
| Authentication information | Yes | A replaced password value is held in memory for Undo, and users can save a test password pattern |
| Website content | Yes | Field labels and values are read to decide what to fill |
| Financial and payment information | Consider | Card fields are skipped, but a bank account value on a page could be held in memory for Undo |
| Web history, location, user activity, communications, health | No | No addresses are recorded and none of this is read for its own sake |

Tick all three certifications:

- Data is not sold or transferred to third parties, outside the approved use cases.
- Data is not used or transferred for purposes unrelated to the item's single purpose.
- Data is not used or transferred to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the public address of `PRIVACY.md`.

## Test instructions for the reviewer

```
No account or login is needed.

1. Open any page with a web form.
2. Click the Smart Autofill icon in the toolbar. The fields fill at once, with no popup.
3. Hover over the icon to see how many fields were filled.
4. Right-click the icon and choose "Undo last fill" to restore the previous values.
5. Right-click the icon, open "Test data" and choose "Invalid data", then click the icon again to fill the form with values that should fail validation.
6. Right-click a text field to fill just that field or insert a test value.
7. Right-click the icon and choose Options to see the settings.

The extension never submits a form. It makes no network requests and uses no remote code.

This is a testing tool for developers and QA engineers. All values are generated on the device or come from a built-in list. An optional setting, off by default and labelled for authorised testing only, adds common security test strings to the field menu. Identifier values such as Aadhaar and PAN follow a public format so that form validation can be tested. They are not real documents, are not linked to real people, and the listing tells users not to use them as real identity details.
```

## Other stores

The description, privacy answers, permission reasons, reviewer steps and images above work for every store. In the description's last line, replace "Chrome doesn't allow extensions on its own pages" with "browsers don't allow extensions on their own pages".

Brave and Vivaldi install from the Chrome Web Store, so they need no separate listing.

**Microsoft Edge Add-ons**

- Upload `release/smart-autofill-<version>.zip`, the same package as Chrome.
- Category: Developer tools. Logo: `public/icons/icon-128.png`.
- Search terms: `form filler`, `test data`, `QA testing`, `autofill`, `fake data`, `form testing`.
- Paste the reviewer steps into **Notes for certification**.

**Firefox Add-ons**

- Run `npm run package:firefox` and upload `release/smart-autofill-firefox-<version>.zip`.
- Upload the source package when asked, because the code is bundled: `release/smart-autofill-source-<version>.zip`. Create it from a clean commit with `git archive --format=zip -o release/smart-autofill-source-<version>.zip HEAD`.
- Reviewer notes: `Build with Node.js 22.12 or later: npm ci, then npm run package:firefox. The output is in dist-firefox/. No account is needed to test.` Add the reviewer steps above.
- The add-on ID in `scripts/build.mjs` must never change after the first release.

**Opera Add-ons**

- Upload `release/smart-autofill-<version>.zip`, the same package as Chrome.
- Opera Mini does not run extensions, so it cannot be supported.

## Distribution

Start with **Unlisted** if you want a real install to test before going public, then switch to **Public** once it has passed review.
