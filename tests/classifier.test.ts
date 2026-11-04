import { describe, expect, it } from "vitest";
import { classifyField, FieldKind } from "../src/content/classifier";
import { splitWords } from "../src/content/context";
import { find, render } from "./helpers";

const classifyLabelled = (label: string, attributes = ""): FieldKind => {
  render(`<div><label for="field">${label}</label><input id="field" ${attributes}></div>`);
  return classifyField(find("#field"));
};

const classifyMarkup = (html: string): FieldKind => {
  render(html);
  return classifyField(find("#field"));
};

describe("splitWords", () => {
  it.each([
    ["fullName"], ["FullName"], ["full_name"], ["full-name"], ["FULL_NAME"], ["full.name"], ["Full Name *"], ["user[full][name]"]
  ])("normalises %j", (value) => {
    expect(splitWords(value).endsWith("full name")).toBe(true);
  });

  it("separates acronyms and trailing digits", () => {
    expect(splitWords("taxID")).toBe("tax id");
    expect(splitWords("URLPath")).toBe("url path");
    expect(splitWords("address2")).toBe("address 2");
  });
});

describe("classifyField labels", () => {
  it.each<[string, FieldKind]>([
    ["Email", "email"],
    ["E-mail address", "email"],
    ["Confirm Email", "email"],
    ["Name", "fullName"],
    ["Your name", "fullName"],
    ["Name *", "fullName"],
    ["Full Name", "fullName"],
    ["Candidate Name", "fullName"],
    ["First Name", "firstName"],
    ["Surname", "lastName"],
    ["Domain", "domain"],
    ["Company Domain", "domain"],
    ["Website", "website"],
    ["Company Website", "website"],
    ["Company Address", "address"],
    ["Company Phone", "phone"],
    ["Company Email", "email"],
    ["Company Name", "company"],
    ["Organization", "company"],
    ["Tax ID", "taxId"],
    ["Federal Tax ID", "taxId"],
    ["EIN", "taxId"],
    ["GSTIN", "gstin"],
    ["GST Number", "gstin"],
    ["PAN Number", "taxId"],
    ["Age", "age"],
    ["Experience", "experience"],
    ["Years of Experience", "experience"],
    ["Date of Birth", "dateOfBirth"],
    ["DOB", "dateOfBirth"],
    ["Birthday", "dateOfBirth"],
    ["Birth Date", "dateOfBirth"],
    ["Start Date", "date"],
    ["Expiry Date", "futureDate"],
    ["Country", "country"],
    ["State", "state"],
    ["Province", "state"],
    ["City", "city"],
    ["Postal Code", "zip"],
    ["PIN Code", "zip"],
    ["Street Address", "street"],
    ["Address Line 2", "addressLine2"],
    ["Address", "address"],
    ["Job Title", "jobTitle"],
    ["Comments", "message"]
  ])("classifies %j as %s", (label, kind) => {
    expect(classifyLabelled(label)).toBe(kind);
  });

  it("falls back to text for an unrecognised field", () => {
    expect(classifyLabelled("Favourite colour")).toBe("text");
  });

  it("does not treat other kinds of name as a person's name", () => {
    expect(classifyLabelled("Project Name", 'name="name"')).toBe("text");
  });
});

describe("classifyField attributes", () => {
  it.each<[string, FieldKind]>([
    ["fullName", "fullName"],
    ["FullName", "fullName"],
    ["full_name", "fullName"],
    ["full-name", "fullName"],
    ["fullname", "fullName"],
    ["name", "fullName"],
    ["firstName", "firstName"],
    ["FirstName", "firstName"],
    ["lastName", "lastName"],
    ["taxId", "taxId"],
    ["taxID", "taxId"],
    ["tax_id", "taxId"],
    ["companyName", "company"],
    ["emailAddress", "email"],
    ["dateOfBirth", "dateOfBirth"],
    ["dob", "dateOfBirth"],
    ["phoneNumber", "phone"],
    ["postalCode", "zip"],
    ["zipCode", "zip"],
    ["addressLine1", "street"],
    ["address2", "addressLine2"],
    ["user[email]", "email"],
    ["billing.address.city", "city"]
  ])("classifies name=%j as %s", (name, kind) => {
    expect(classifyMarkup(`<input id="field" name="${name}">`)).toBe(kind);
  });

  it.each<[string, FieldKind]>([
    ['placeholder="Company name"', "company"],
    ['aria-label="Years of experience"', "experience"],
    ['title="Tax ID"', "taxId"],
    ['formcontrolname="firstName"', "firstName"],
    ['data-testid="postal-code"', "zip"]
  ])("classifies from %s", (attribute, kind) => {
    expect(classifyMarkup(`<input id="field" ${attribute}>`)).toBe(kind);
  });

  it.each<[string, FieldKind]>([
    ["email", "email"],
    ["name", "fullName"],
    ["given-name", "firstName"],
    ["family-name", "lastName"],
    ["organization", "company"],
    ["bday", "dateOfBirth"],
    ["country-name", "country"],
    ["address-level1", "state"],
    ["address-level2", "city"],
    ["postal-code", "zip"],
    ["shipping postal-code", "zip"],
    ["cc-number", "skip"],
    ["one-time-code", "skip"]
  ])("classifies autocomplete=%j as %s", (token, kind) => {
    expect(classifyMarkup(`<input id="field" autocomplete="${token}">`)).toBe(kind);
  });

  it("lets autocomplete outvote a misleading name", () => {
    expect(classifyMarkup('<input id="field" name="field_7_city" autocomplete="email">')).toBe("email");
  });

  it("ignores autocomplete values that say nothing about the field", () => {
    expect(classifyMarkup('<input id="field" name="city" autocomplete="off">')).toBe("city");
  });
});

describe("classifyField input types", () => {
  it.each<[string, string, FieldKind]>([
    ["email", "Contact", "email"],
    ["tel", "Contact", "phone"],
    ["password", "Secret", "password"],
    ["url", "Link", "url"],
    ["url", "Company Website", "website"],
    ["date", "Date of Birth", "dateOfBirth"],
    ["date", "Age", "date"],
    ["date", "Starts", "date"],
    ["number", "Age", "age"],
    ["number", "Quantity", "number"],
    ["time", "Start", "time"],
    ["month", "Start", "month"],
    ["week", "Start", "week"],
    ["datetime-local", "Start", "dateTime"]
  ])("classifies type=%s labelled %j as %s", (type, label, kind) => {
    expect(classifyLabelled(label, `type="${type}"`)).toBe(kind);
  });

  it("treats numeric inputmode as a number", () => {
    expect(classifyLabelled("Quantity", 'inputmode="numeric"')).toBe("number");
  });

  it("treats an unknown textarea as a message", () => {
    expect(classifyMarkup('<textarea id="field"></textarea>')).toBe("message");
  });
});

describe("classifyField fields left alone", () => {
  it.each([
    ['<input id="field" type="search" name="city">'],
    ['<input id="field" role="searchbox">'],
    ['<form role="search"><input id="field" name="city"></form>'],
    ['<input id="field" placeholder="Search products">'],
    ['<input id="field" name="cardNumber">'],
    ['<input id="field" name="cvv">'],
    ['<input id="field" placeholder="Enter OTP">']
  ])("skips %s", (html) => {
    expect(classifyMarkup(html)).toBe("skip");
  });
});

describe("classifyField page controls", () => {
  it.each([
    ['<header><select id="field"><option>Q1 Tech</option></select></header>'],
    ['<nav><input id="field" name="city"></nav>'],
    ['<div role="banner"><input id="field" name="city"></div>'],
    ['<div class="ant-layout-header"><select id="field"></select></div>'],
    ['<div class="ant-pagination-options"><select id="field"></select></div>'],
    ['<form><div class="pagination"><select id="field"></select></div></form>']
  ])("skips %s", (html) => {
    expect(classifyMarkup(html)).toBe("skip");
  });

  it.each([
    ['<form><header><input id="field" name="city"></header></form>'],
    ['<div role="dialog"><header><input id="field" name="city"></header></div>']
  ])("still fills a form's own header in %s", (html) => {
    expect(classifyMarkup(html)).toBe("city");
  });
});

describe("classifyField context", () => {
  it("reads a wrapping label", () => {
    expect(classifyMarkup('<label>Full Name <input id="field"></label>')).toBe("fullName");
  });

  it("reads aria-labelledby", () => {
    expect(classifyMarkup('<span id="caption">Tax ID</span><input id="field" aria-labelledby="caption">')).toBe("taxId");
  });

  it("reads aria-describedby", () => {
    expect(classifyMarkup('<p id="help">Your city</p><input id="field" aria-describedby="help">')).toBe("city");
  });

  it("reads unlabelled text from the field's own container", () => {
    expect(classifyMarkup('<div><span>Age</span><input id="field"></div>')).toBe("age");
  });

  it("climbs past wrappers that hold only the field", () => {
    expect(classifyMarkup('<div><div>Tax ID</div><div><div><input id="field"></div></div></div>')).toBe("taxId");
  });

  it("still reads container text when the only sibling field is hidden", () => {
    expect(classifyMarkup('<div><span>Age</span><input type="hidden" name="token"><input id="field"></div>')).toBe("age");
  });

  it("does not read a dropdown's options as its label", () => {
    expect(classifyMarkup('<div><label for="field">Country</label><select id="field"><option>Phone</option></select></div>')).toBe("country");
  });

  it("prefers a label over helper text about something else", () => {
    expect(classifyMarkup('<div><label for="field">Phone</label><input id="field"><small>We never share your email</small></div>')).toBe("phone");
  });

  it("finds labels inside a shadow root", () => {
    render('<div id="host"></div>');
    const shadow = find<HTMLElement>("#host").attachShadow({ mode: "open" });
    shadow.innerHTML = '<label for="inner">City</label><input id="inner">';
    const input = shadow.querySelector("input");
    expect(input && classifyField(input)).toBe("city");
  });
});

describe("classifyField neighbouring fields", () => {
  it("classifies each field in a flat form by its own label", () => {
    render(`
      <form>
        <label for="email">Email</label><input id="email">
        <label for="company">Company Name</label><input id="company">
        <label for="tax">Tax ID</label><input id="tax">
        <label for="age">Age</label><input id="age">
      </form>
    `);

    expect(classifyField(find("#email"))).toBe("email");
    expect(classifyField(find("#company"))).toBe("company");
    expect(classifyField(find("#tax"))).toBe("taxId");
    expect(classifyField(find("#age"))).toBe("age");
  });

  it("reads the text just before each field in a label-free form", () => {
    render('<form>Age <input id="age"><br>Email <input id="email"><br>City <input id="city"></form>');

    expect(classifyField(find("#age"))).toBe("age");
    expect(classifyField(find("#email"))).toBe("email");
    expect(classifyField(find("#city"))).toBe("city");
  });

  it("does not borrow a neighbour's label for an unlabelled field", () => {
    render('<div><label for="email">Email</label><input id="email"><input id="other"></div>');
    expect(classifyField(find("#other"))).toBe("text");
  });

  it("does not borrow a preceding label that belongs to another field", () => {
    render('<div><input id="email"><label for="email">Email</label><input id="other"></div>');
    expect(classifyField(find("#other"))).toBe("text");
  });
});
