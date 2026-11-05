export interface LibraryValue {
  label: string;
  value: string;
}

export interface LibraryCategory {
  id: string;
  title: string;
  values: LibraryValue[];
}

const characters = (count: number): LibraryValue => ({ label: `${count} characters`, value: "x".repeat(count) });

/** Problem values for exploratory testing. Labels avoid & and %, which Chrome's menus treat specially. */
export const VALUE_LIBRARY: LibraryCategory[] = [
  {
    id: "length",
    title: "Text length",
    values: [characters(1), characters(50), characters(255), characters(256), characters(1000), characters(5000)]
  },
  {
    id: "numbers",
    title: "Numbers",
    values: [
      { label: "Zero", value: "0" },
      { label: "Negative", value: "-1" },
      { label: "Small decimal", value: "0.01" },
      { label: "Thousands separator", value: "1,000" },
      { label: "Exponent", value: "1e5" },
      { label: "Largest 32-bit integer", value: "2147483647" },
      { label: "Above 32-bit integer", value: "2147483648" },
      { label: "Above safe JavaScript integer", value: "9007199254740993" }
    ]
  },
  {
    id: "emails",
    title: "Email addresses",
    values: [
      { label: "Valid: plus tag", value: "first.last+tag@example.com" },
      { label: "Valid: subdomain", value: "user@mail.example.co.uk" },
      { label: "Invalid: no at sign", value: "user.example.com" },
      { label: "Invalid: two at signs", value: "user@@example.com" },
      { label: "Invalid: no domain", value: "user@" },
      { label: "Invalid: contains a space", value: "us er@example.com" }
    ]
  },
  {
    id: "names",
    title: "Names",
    values: [
      { label: "Apostrophe", value: "O'Brien" },
      { label: "Hyphen", value: "Anne-Marie" },
      { label: "Accents", value: "José García" },
      { label: "Single character", value: "X" },
      { label: "Chinese", value: "李小龙" },
      { label: "Arabic", value: "محمد علي" }
    ]
  },
  {
    id: "unicode",
    title: "Unicode",
    values: [
      { label: "Emoji", value: "Test 🧪🚀👩‍💻" },
      { label: "Right-to-left", value: "مرحبا بالعالم" },
      { label: "Chinese, Japanese, Korean", value: "测试 テスト 테스트" },
      { label: "Zero-width space", value: "te\u200Bst" },
      { label: "Combining marks", value: "Z\u0351a\u0300l\u0301g\u0302o\u0303" }
    ]
  },
  {
    id: "whitespace",
    title: "Whitespace and words",
    values: [
      { label: "Only spaces", value: "   " },
      { label: "Spaces around", value: "  text  " },
      { label: "Tab inside", value: "one\ttwo" },
      { label: "Line break inside", value: "one\ntwo" },
      { label: "The word null", value: "null" },
      { label: "The word undefined", value: "undefined" },
      { label: "The word true", value: "true" }
    ]
  },
  {
    id: "special",
    title: "Special characters",
    values: [
      { label: "HTML characters", value: "<>&\"'" },
      { label: "Percent signs", value: "100% %d %s" },
      { label: "Backslashes", value: "C:\\temp\\new" },
      { label: "Symbols", value: "!@#$^*()_+-=[]{}|;:,.?/~`" }
    ]
  },
  {
    id: "dates",
    title: "Dates",
    values: [
      { label: "Leap day", value: "2024-02-29" },
      { label: "Not a leap day", value: "2023-02-29" },
      { label: "31 April", value: "2024-04-31" },
      { label: "Unix epoch", value: "1970-01-01" },
      { label: "Far future", value: "9999-12-31" }
    ]
  }
];

export const SECURITY_VALUES: LibraryCategory = {
  id: "security",
  title: "Security strings (authorised testing only)",
  values: [
    { label: "Script tag", value: "<script>alert(1)</script>" },
    { label: "Image with error handler", value: "\"><img src=x onerror=alert(1)>" },
    { label: "SQL always true", value: "' OR '1'='1" },
    { label: "SQL comment", value: "admin'--" },
    { label: "Path traversal", value: "../../etc/passwd" },
    { label: "Template expression", value: "{{7*7}}" }
  ]
};

export const libraryFor = (showSecurityValues: boolean): LibraryCategory[] =>
  showSecurityValues ? [...VALUE_LIBRARY, SECURITY_VALUES] : VALUE_LIBRARY;
