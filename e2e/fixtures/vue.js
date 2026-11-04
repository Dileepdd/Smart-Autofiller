import { createApp, reactive, ref, watch, toRaw } from "vue/dist/vue.esm-bundler.js";

const STATES = { India: ["Andhra Pradesh", "Karnataka"], Canada: ["Ontario"] };

createApp({
  setup() {
    const form = reactive({ firstName: "", lastName: "", email: "", age: "", country: "", state: "", agree: false, plan: "", lazyCity: "" });
    const states = ref([]);
    watch(() => form.country, (c) => setTimeout(() => { states.value = STATES[c] ?? []; }, 300));
    window.__state = () => ({ ...toRaw(form) });
    return { form, states };
  },
  template: `
    <form @submit.prevent="">
      <div><label for="firstName">First Name</label><input id="firstName" v-model="form.firstName"></div>
      <div><label for="lastName">Last Name</label><input id="lastName" v-model="form.lastName"></div>
      <div><label for="email">Email</label><input id="email" v-model="form.email"></div>
      <div><label for="age">Age</label><input id="age" type="number" v-model.number="form.age"></div>
      <div><label for="country">Country</label><select id="country" v-model="form.country"><option value="">Choose</option><option>Canada</option><option>India</option></select></div>
      <div><label for="state">State</label><select id="state" v-model="form.state" :disabled="!states.length"><option value="">Choose</option><option v-for="s in states">{{ s }}</option></select></div>
      <div><label for="lazyCity">City</label><input id="lazyCity" v-model.lazy="form.lazyCity"></div>
      <div><input id="free" type="radio" value="free" v-model="form.plan" name="plan"><input id="pro" type="radio" value="pro" v-model="form.plan" name="plan"></div>
      <div><label><input type="checkbox" required v-model="form.agree"> Terms</label></div>
    </form>`
}).mount("#root");
