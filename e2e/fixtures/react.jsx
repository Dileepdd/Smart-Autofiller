import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Select from "react-select";
import { TextField, Select as MuiSelect, MenuItem, FormControl, InputLabel, Autocomplete, Checkbox, FormControlLabel } from "@mui/material";

const STATES = { India: ["Andhra Pradesh", "Karnataka"], Canada: ["Ontario"] };
const CITIES = { "Andhra Pradesh": ["Visakhapatnam"], Karnataka: ["Bengaluru"], Ontario: ["Toronto"] };

function App() {
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", dob: "", country: "", state: "", city: "", zip: "", terms: false, muiCompany: "", muiRole: "", rsCountry: "", muiAuto: "", notes: "" });
  const [states, setStates] = useState([]);
  const [cities, setCities] = useState([]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  window.__state = () => form;

  useEffect(() => {
    if (!form.country) return;
    const t = setTimeout(() => setStates(STATES[form.country] ?? []), 300);
    return () => clearTimeout(t);
  }, [form.country]);
  useEffect(() => {
    if (!form.state) return;
    const t = setTimeout(() => setCities(CITIES[form.state] ?? []), 300);
    return () => clearTimeout(t);
  }, [form.state]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); window.__submitted = true; }}>
      <div><label htmlFor="fullName">Full Name</label><input id="fullName" value={form.fullName} onChange={set("fullName")} /></div>
      <div><label htmlFor="email">Email</label><input id="email" type="email" value={form.email} onChange={set("email")} /></div>
      <div><label htmlFor="phone">Phone</label><input id="phone" type="tel" value={form.phone} onChange={set("phone")} /></div>
      <div><label htmlFor="dob">Date of Birth</label><input id="dob" type="date" value={form.dob} onChange={set("dob")} /></div>
      <div><label htmlFor="country">Country</label>
        <select id="country" value={form.country} onChange={set("country")}><option value="">Select</option><option>Canada</option><option>India</option></select></div>
      <div><label htmlFor="state">State</label>
        <select id="state" value={form.state} onChange={set("state")} disabled={!states.length}><option value="">Select</option>{states.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div><label htmlFor="city">City</label>
        <select id="city" value={form.city} onChange={set("city")} disabled={!cities.length}><option value="">Select</option>{cities.map((s) => <option key={s}>{s}</option>)}</select></div>
      <div><label htmlFor="zip">Postal Code</label><input id="zip" value={form.zip} onChange={set("zip")} /></div>
      <div><label><input id="terms" type="checkbox" required checked={form.terms} onChange={set("terms")} /> I agree</label></div>
      <TextField id="muiCompany" label="Company Name" value={form.muiCompany} onChange={set("muiCompany")} />
      <FormControl fullWidth>
        <InputLabel id="role-label">Job Role</InputLabel>
        <MuiSelect labelId="role-label" id="muiRole" label="Job Role" value={form.muiRole} onChange={(e) => setForm((f) => ({ ...f, muiRole: e.target.value }))}>
          <MenuItem value="dev">Developer</MenuItem><MenuItem value="qa">Tester</MenuItem>
        </MuiSelect>
      </FormControl>
      <div><label id="rs-label">Billing Country</label>
        <Select aria-labelledby="rs-label" inputId="rsCountry" options={["Canada", "India"].map((v) => ({ value: v, label: v }))} onChange={(o) => setForm((f) => ({ ...f, rsCountry: o?.value ?? "" }))} /></div>
      <Autocomplete id="muiAuto" options={["Mumbai", "Pune"]} onChange={(_e, v) => setForm((f) => ({ ...f, muiAuto: v ?? "" }))} renderInput={(p) => <TextField {...p} label="Preferred City" />} />
      <div><label htmlFor="notes">Notes</label><textarea id="notes" value={form.notes} onChange={set("notes")} /></div>
      <button type="submit">Send</button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(<App />);
