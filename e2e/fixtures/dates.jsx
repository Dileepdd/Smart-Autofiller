import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DatePicker as AntDatePicker } from "antd";
import { DatePicker as MuiDatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import ReactDatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import { createApp, h, ref } from "vue/dist/vue.esm-bundler.js";
import { ElDatePicker } from "element-plus";
import "element-plus/dist/index.css";

const localIso = (date) => date.toLocaleDateString("en-CA");

function Flat({ onPick }) {
  const input = useRef(null);
  useEffect(() => { flatpickr(input.current, { onChange: (_d, text) => onPick(text) }); }, []);
  return <input id="flat" ref={input} />;
}

function App() {
  const [s, setS] = useState({ ant: "", mui: "", rdp: "", flat: "" });
  const [rdp, setRdp] = useState(null);
  const up = (k, v) => setS((f) => ({ ...f, [k]: v }));
  window.__react = () => s;
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <form style={{ width: 420 }} onSubmit={(e) => { e.preventDefault(); window.__submitted = true; }}>
        <div><label htmlFor="ant">Date of Birth</label><AntDatePicker id="ant" onChange={(_d, t) => up("ant", t)} /></div>
        <div><MuiDatePicker label="Birth Date" onChange={(v) => up("mui", v?.isValid() ? v.format("YYYY-MM-DD") : "")} /></div>
        <div><label htmlFor="rdp">DOB</label><ReactDatePicker id="rdp" selected={rdp} onChange={(d) => { setRdp(d); up("rdp", d ? localIso(d) : ""); }} /></div>
        <div><label htmlFor="flat">Birthday</label><Flat onPick={(t) => up("flat", t)} /></div>
        <button type="submit">Send</button>
      </form>
    </LocalizationProvider>
  );
}
createRoot(document.getElementById("root")).render(<App />);

const value = ref("");
createApp({
  setup: () => () => h("div", { style: "width:300px" }, [
    h("label", { for: "el" }, "Date of Birth"),
    h(ElDatePicker, { id: "el", modelValue: value.value, "onUpdate:modelValue": (v) => { value.value = v; }, type: "date", valueFormat: "YYYY-MM-DD" })
  ])
}).mount("#vue");

window.__state = () => ({ ...window.__react(), el: value.value ?? "", submitted: Boolean(window.__submitted) });
