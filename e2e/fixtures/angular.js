import "zone.js";
import "@angular/compiler";
import { Component } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";

class App {
  form = new FormGroup({
    fullName: new FormControl("", Validators.required),
    emailAddress: new FormControl("", [Validators.required, Validators.email]),
    taxId: new FormControl(""),
    country: new FormControl(""),
    state: new FormControl({ value: "", disabled: true }),
    terms: new FormControl(false, Validators.requiredTrue)
  });
  states = [];
  constructor() {
    this.form.controls.country.valueChanges.subscribe((c) => setTimeout(() => {
      this.states = c === "India" ? ["Karnataka"] : ["Ontario"];
      this.form.controls.state.enable();
    }, 300));
    window.__state = () => ({
      ...this.form.getRawValue(),
      valid: this.form.valid,
      touchedName: this.form.controls.fullName.touched
    });
  }
}

const Comp = Component({
  selector: "app-root",
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form">
      <div><input formControlName="fullName" placeholder="Enter here"></div>
      <div><input formControlName="emailAddress"></div>
      <div><input formControlName="taxId"></div>
      <div><label for="c">Country</label><select id="c" formControlName="country"><option value="">Select</option><option value="Canada">Canada</option><option value="India">India</option></select></div>
      <div><label for="s">State</label><select id="s" formControlName="state"><option value="">Select</option>@for (s of states; track s) {<option [value]="s">{{s}}</option>}</select></div>
      <div><label><input type="checkbox" required formControlName="terms"> Accept</label></div>
    </form>`
})(App);

bootstrapApplication(Comp);
