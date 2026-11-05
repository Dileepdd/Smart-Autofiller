import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MantineProvider, Select, TextInput } from "@mantine/core";
import "@mantine/core/styles.css";

const STATES = { "United States": ["California", "Texas"] };
const CITIES = { California: ["Los Angeles", "San Francisco"], Texas: ["Austin", "Houston"] };
const API_DELAY_MS = 1500;

/** Options come from a slow server, as they do for entity fields in real admin apps. */
function useRemoteOptions(source, key) {
  const [options, setOptions] = useState([]);
  useEffect(() => {
    setOptions([]);
    if (!key) return undefined;
    const timer = setTimeout(() => setOptions(source[key] ?? []), API_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key]);
  return options;
}

function App() {
  const params = new URLSearchParams(location.search);
  const searchable = params.has("searchable");
  const [form, setForm] = useState({ company: "", taxId: "", country: "United States", state: null, city: null, street: "", zip: "" });
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const text = (key) => (event) => set(key)(event.currentTarget.value);
  const states = useRemoteOptions(STATES, form.country);
  const cities = useRemoteOptions(CITIES, form.state);
  window.__state = () => ({ ...form, taxValid: /^\d{2}-\d{7}$/.test(form.taxId) });

  return (
    <MantineProvider>
      <div style={{ width: 420, minHeight: 700 }}>
        <TextInput label="Vendor Company Name" required value={form.company} onChange={text("company")} />
        <div>
          <TextInput label="Federal Tax ID" required value={form.taxId} onChange={text("taxId")} />
          <p>Format: XX-XXXXXXX</p>
        </div>
        <Select label="Country" required clearable data={["United States"]} value={form.country} onChange={set("country")} />
        <Select label="State" required placeholder="Select State" searchable={searchable} data={states} value={form.state} onChange={set("state")} />
        <Select label="City" required placeholder="Select City" searchable={searchable} disabled={!form.state} data={cities} value={form.city} onChange={set("city")} />
        <TextInput label="Street Number And Name" required value={form.street} onChange={text("street")} />
        <TextInput label="ZIP Code" required value={form.zip} onChange={text("zip")} />
      </div>
    </MantineProvider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
