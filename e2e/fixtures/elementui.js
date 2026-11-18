import Vue from "vue";
import ElementUI from "element-ui";
import "element-ui/lib/theme-chalk/index.css";

Vue.use(ElementUI);

/** Modelled on a real Vue 2 form: searchable Element UI selects labelled by a span, with ids for values, whose options load from a server. */
const STATES = { "United States": ["Alabama", "Alaska"], India: ["Goa", "Kerala"] };
const CITIES = { Alabama: ["Mobile", "Selma"], Alaska: ["Juneau"], Goa: ["Panaji"], Kerala: ["Kochi"] };
const LOAD_MS = 1100;
const appendToBody = !location.search.includes("inline");

new Vue({
  el: "#root",
  data: () => ({ country: "United States", state: "", city: "", status: "", readOnly: "Locked", name: "", zip: "", states: [], cities: [] }),
  watch: {
    country: { immediate: true, handler(country) { this.state = ""; this.load("states", STATES[country] ?? []); } },
    state(state) { this.city = ""; this.cities = []; if (state) this.load("cities", CITIES[state] ?? []); }
  },
  created() {
    window.__state = () => ({ country: this.country, state: this.state, city: this.city, status: this.status, name: this.name, zip: this.zip, readOnly: this.readOnly });
  },
  methods: {
    load(list, options) {
      this[list] = [];
      clearTimeout(this.timers?.[list]);
      this.timers = { ...this.timers, [list]: setTimeout(() => { this[list] = options; }, LOAD_MS) };
    },
    select(h, label, model, options, disabled = false) {
      return h("div", { class: "field" }, [
        h("span", { class: "field-sub-label" }, [label, h("span", { style: { color: "red" } }, "*")]),
        h("el-select", {
          props: { value: this[model], placeholder: `Select ${label}`, disabled, clearable: true, filterable: true, popperAppendToBody: appendToBody },
          on: { input: (value) => { this[model] = value; } }
        }, options.map((option) => h("el-option", { key: option, props: { label: option, value: option } })))
      ]);
    }
  },
  render(h) {
    return h("form", { on: { submit: (event) => event.preventDefault() } }, [
      this.select(h, "Country", "country", Object.keys(STATES)),
      this.select(h, "State", "state", this.states),
      this.select(h, "City", "city", this.cities, !this.state),
      h("div", { attrs: { id: "street" } }, [h("label", { attrs: { for: "text" } }, "Street Number And Name"), h("input", { attrs: { placeholder: "Apt or Suite Number" } })]),
      this.select(h, "Status", "status", ["Active", "Inactive"]),
      this.select(h, "Vendor Tier", "readOnly", ["Locked"], true),
      h("label", ["Name", h("input", { attrs: { name: "name" }, domProps: { value: this.name }, on: { input: (event) => { this.name = event.target.value; } } })]),
      h("label", ["ZIP Code", h("input", { attrs: { name: "zip" }, domProps: { value: this.zip }, on: { input: (event) => { this.zip = event.target.value; } } })])
    ]);
  }
});
