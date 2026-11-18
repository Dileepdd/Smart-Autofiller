import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import { Command } from "cmdk";
import { PhoneInput } from "react-international-phone";

/**
 * Modelled on a real React CRM form: searchable lists that fetch their options when opened,
 * Radix selects that hide the page while open, children that wait for a parent, and a drawer of records.
 */
const STATES = { "United States": ["Alabama", "Alaska"], Canada: ["Alberta", "Manitoba"] };
const CITIES = { Alabama: ["Mobile", "Selma"], Alaska: ["Juneau"], Alberta: ["Banff"], Manitoba: ["Brandon"] };

function ListField({ label, options, value, onChange, disabled, pendingText }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => setLoaded(options), 200);
    return () => clearTimeout(timer);
  }, [open, options]);
  return (
    <label>
      <span>{label}</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" role="combobox" aria-expanded={open} disabled={disabled} data-field={label}>
            <span>{pendingText || value || `Please select the ${label.toLowerCase()}`}</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content>
            <Command shouldFilter={false}>
              <Command.Input placeholder="Search..." />
              <Command.List>
                <Command.Empty>No results found.</Command.Empty>
                {value && <Command.Item value="__clear__" onSelect={() => { onChange(""); setOpen(false); }}>Clear selection</Command.Item>}
                {loaded.map((option) => (
                  <Command.Item key={option} value={option} onSelect={() => { onChange(option); setOpen(false); }}>{option}</Command.Item>
                ))}
              </Command.List>
            </Command>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </label>
  );
}

/** A popup with its own search box whose rows are plain buttons, showing only the first page of a long list. */
function GeoSelect({ label, options, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <span>{label}</span>
      <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
        <Popover.Trigger asChild>
          <button type="button" role="combobox" aria-expanded={open} disabled={disabled}><span>{value || `Select ${label}`}</span></button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content>
            <div><input placeholder="Search…" /></div>
            <div>
              {options.slice(0, 3).map((option) => (
                <button key={option} type="button" className="geo-row" onClick={() => { onChange(option); setOpen(false); }}>
                  <span className="geo-text">{option}</span>
                </button>
              ))}
              <button type="button" className="geo-more">Load more…</button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function GeoForm() {
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  useEffect(() => {
    window.__state = () => ({
      country, state, city,
      name: document.querySelector("[name=name]").value,
      zip: document.querySelector("[name=zip]").value,
      open: document.querySelectorAll(".geo-row").length
    });
  });
  return (
    <form onSubmit={(event) => { event.preventDefault(); window.__submitted = true; }}>
      <label>Name<input name="name" /></label>
      <GeoSelect label="Country" options={["Afghanistan", "Albania", "United States"]} value={country} onChange={setCountry} />
      <GeoSelect label="State" options={["Alabama", "Alaska", "Arizona"]} value={state} onChange={(next) => { setState(next); setCity(""); }} />
      <GeoSelect label="City" options={state ? ["Mobile", "Selma", "Dothan"] : []} value={city} onChange={setCity} disabled={!state} />
      <label>ZIP Code<input name="zip" /></label>
      <button type="submit">Save</button>
    </form>
  );
}

/** Keyed on its value like the real form, so choosing an option replaces the trigger. */
function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <span>{label}</span>
      <Select.Root key={value || "empty"} value={value} onValueChange={onChange}>
        <Select.Trigger><Select.Value placeholder="Select option" /></Select.Trigger>
        <Select.Portal>
          <Select.Content position="popper">
            <Select.Viewport>
              {options.map((option) => <Select.Item key={option} value={option}><Select.ItemText>{option}</Select.ItemText></Select.Item>)}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

function RecordDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" role="combobox" onClick={() => setOpen(true)}><span title="Select record">Select record</span></button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Content className="sheet">
            <Dialog.Title>Select record</Dialog.Title>
            <Dialog.Description>Tick a record</Dialog.Description>
            <table><tbody>{["A", "B", "C"].map((row) => <tr key={row}><td><input type="checkbox" /></td><td>{row} one</td><td>{row} two</td></tr>)}</tbody></table>
            <button type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" onClick={() => { window.__applied = true; setOpen(false); }}>Apply</button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function App() {
  const withDrawer = location.search.includes("drawer");
  const withEmptyLists = location.search.includes("empty");
  const [country, setCountry] = useState("United States");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [course, setCourse] = useState("");
  const [gender, setGender] = useState("");
  const [leadSource, setLeadSource] = useState("Walk-in");
  const [tail, setTail] = useState("");
  const [phone, setPhone] = useState("");
  const [cities, setCities] = useState(null);
  useEffect(() => {
    setCities(null);
    setCity("");
    if (!state) return undefined;
    const timer = setTimeout(() => setCities(CITIES[state] ?? []), 500);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    window.__state = () => ({
      country, state, city, course, gender, leadSource, tail, phone,
      name: document.querySelector("[name=name]").value,
      email: document.querySelector("[name=email]").value,
      zip: document.querySelector("[name=zip]").value,
      uploadType: document.querySelector("[name=upload]:checked")?.value ?? "",
      lists: [...document.querySelectorAll("[role=listbox]")].filter((list) => list.offsetParent !== null).length,
      drawer: document.querySelector(".sheet") !== null,
      pageHidden: document.querySelector("[name=name]").closest("[aria-hidden=true]") !== null,
      applied: window.__applied === true
    });
  });

  return (
    <div id="scroller" style={{ height: 400, overflow: "auto" }}>
    <form onSubmit={(event) => { event.preventDefault(); window.__submitted = true; }}>
      <label><input type="radio" name="upload" value="email" />Email</label>
      <label><input type="radio" name="upload" value="mobile" />Mobile</label>
      <label>Name<input name="name" /></label>
      <label>Email Address<input name="email" /></label>
      <div><span>Mobile Number</span><PhoneInput defaultCountry="in" value={phone} onChange={setPhone} /></div>
      <ListField label="Country" options={Object.keys(STATES)} value={country} onChange={(next) => { setCountry(next); setState(""); }} />
      <ListField label="State" options={STATES[country] ?? []} value={state} onChange={setState} disabled={!country} />
      <ListField label="City" options={cities ?? []} value={city} onChange={setCity} disabled={!cities} pendingText={state && !cities ? "Waiting for dependencies..." : ""} />
      <ListField label="Course" options={["BBA", "CAT"]} value={course} onChange={setCourse} />
      <SelectField label="Gender" value={gender} onChange={setGender} options={["Male", "Female", "Others"]} />
      <SelectField label="Lead Source" value={leadSource} onChange={setLeadSource} options={["Walk-in", "Website"]} />
      {withDrawer && <RecordDrawer />}
      {withEmptyLists && ["Campaign", "Stream", "Office Location", "Lead Substage"].map((label) => <ListField key={label} label={label} options={[]} value="" onChange={() => undefined} />)}
      {withEmptyLists && <ListField label="Tail" options={["Last"]} value={tail} onChange={setTail} />}
      <label>ZIP Code<input name="zip" /></label>
      <button type="submit">Save</button>
      <div style={{ height: 3000 }} />
    </form>
    </div>
  );
}

const style = document.createElement("style");
style.textContent = ".sheet{position:fixed;inset:0 0 0 auto;width:500px;background:#fff}.sheet[data-state=closed]{animation:leave .3s}@keyframes leave{to{transform:translateX(100%)}}";
document.head.append(style);
createRoot(document.getElementById("root")).render(location.search.includes("geo") ? <GeoForm /> : <App />);
