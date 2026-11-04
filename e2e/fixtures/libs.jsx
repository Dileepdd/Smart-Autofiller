import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Select as AntSelect, Input as AntInput, DatePicker } from "antd";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";

function App() {
  const [s, setS] = useState({ antCountry: "", antName: "", antDate: "", headless: "" });
  window.__state = () => s;
  const up = (k, v) => setS((f) => ({ ...f, [k]: v }));
  return (
    <div style={{ width: 400, minHeight: 500 }}>
      <div><label htmlFor="antName">Full Name</label><AntInput id="antName" value={s.antName} onChange={(e) => up("antName", e.target.value)} /></div>
      <div><label htmlFor="antCountry">Country</label>
        <AntSelect id="antCountry" style={{ width: 200 }} placeholder="Choose" onChange={(v) => up("antCountry", v)} options={[{ value: "Canada" }, { value: "India" }]} /></div>
      <div><label htmlFor="antDate">Start Date</label><DatePicker id="antDate" onChange={(_d, t) => up("antDate", t)} /></div>
      <div>
        <Listbox value={s.headless} onChange={(v) => up("headless", v)}>
          <ListboxButton aria-label="Job Role" id="hl">{s.headless || "Choose role"}</ListboxButton>
          <ListboxOptions anchor="bottom">
            <ListboxOption value="Developer">Developer</ListboxOption>
            <ListboxOption value="Tester">Tester</ListboxOption>
          </ListboxOptions>
        </Listbox>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
