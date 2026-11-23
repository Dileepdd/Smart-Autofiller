import { classifyText, FieldKind } from "../content/classifier";
import { Dataset, datasetCsv, getCursor, getDataset, readDatasetFile, saveCursor, saveDataset, DATASET_KEYS } from "../shared/dataset";

const PREVIEW_ROWS = 5;

/** What a header fills, in words, so a person can check the sheet before using it. */
const KIND_NAMES: Partial<Record<FieldKind, string>> = {
  firstName: "first name", middleName: "middle name", lastName: "last name", fullName: "name", email: "email", phone: "phone",
  gender: "gender", company: "company", jobTitle: "job title", department: "department", street: "street", addressLine2: "address line 2",
  address: "address", city: "city", state: "state", country: "country", zip: "postal code", dateOfBirth: "date of birth",
  date: "date", password: "password", username: "username", website: "website", message: "message", age: "age"
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
};

const state = (message: string): void => { byId("datasetState").textContent = message; };

function fills(header: string): string {
  const kind = classifyText(header);
  const name = kind && KIND_NAMES[kind];
  return name ? `${name} fields` : `fields labelled “${header}”`;
}

function renderPreview(dataset: Dataset): void {
  const table = byId<HTMLTableElement>("datasetPreview");
  const head = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const header of dataset.headers) {
    const cell = document.createElement("th");
    cell.scope = "col";
    const name = document.createElement("span");
    name.textContent = header;
    const target = document.createElement("small");
    target.textContent = `→ ${fills(header)}`;
    cell.append(name, target);
    headerRow.append(cell);
  }
  head.append(headerRow);
  const body = document.createElement("tbody");
  for (const row of dataset.rows.slice(0, PREVIEW_ROWS)) {
    const line = document.createElement("tr");
    for (const value of row) {
      const cell = document.createElement("td");
      cell.textContent = value;
      cell.title = value;
      line.append(cell);
    }
    body.append(line);
  }
  table.replaceChildren(head, body);
}

async function render(): Promise<void> {
  const dataset = await getDataset();
  byId("datasetEmpty").hidden = Boolean(dataset);
  byId("datasetLoaded").hidden = !dataset;
  const position = byId("datasetPosition");
  const goto = byId<HTMLInputElement>("datasetGoto");
  for (const id of ["datasetGotoButton", "datasetRestart"]) byId<HTMLButtonElement>(id).disabled = !dataset;
  goto.disabled = !dataset;
  if (!dataset) {
    position.textContent = "No dataset";
    return;
  }
  const total = dataset.rows.length;
  const { next } = await getCursor();
  byId("datasetSummary").textContent = `${dataset.name} · ${total} ${total === 1 ? "row" : "rows"} · ${dataset.headers.length} columns`;
  position.textContent = next >= total ? `All ${total} rows used` : `Row ${next + 1} of ${total}`;
  goto.max = String(total);
  renderPreview(dataset);
}

async function upload(file: File): Promise<void> {
  state("Reading the file…");
  const read = await readDatasetFile(file);
  if ("error" in read) return state(read.error);
  await saveDataset(read);
  await saveCursor({ next: 0, last: null });
  state(`Loaded ${read.rows.length} rows. The next fill uses row 1.`);
  await render();
}

function download(dataset: Dataset): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([`﻿${datasetCsv(dataset)}`], { type: "text/csv" }));
  link.download = dataset.name.replace(/\.(xlsx|csv|tsv|txt)$/i, "") + ".csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function initDatasets(): void {
  const file = byId<HTMLInputElement>("datasetFile");
  const pick = (): void => file.click();
  byId("datasetUpload").addEventListener("click", pick);
  byId("datasetReplace").addEventListener("click", pick);
  file.addEventListener("change", () => {
    const chosen = file.files?.[0];
    file.value = "";
    if (chosen) void upload(chosen);
  });

  // Dropping a file anywhere on the empty area works as well as the button.
  const drop = byId("datasetEmpty");
  drop.addEventListener("dragover", (event) => { event.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    drop.classList.remove("is-over");
    const dropped = event.dataTransfer?.files[0];
    if (dropped) void upload(dropped);
  });

  byId("datasetDownload").addEventListener("click", async () => {
    const dataset = await getDataset();
    if (dataset) download(dataset);
  });
  byId("datasetRemove").addEventListener("click", async () => {
    await saveDataset(undefined);
    state("Dataset removed.");
    await render();
  });
  byId("datasetRestart").addEventListener("click", async () => {
    await saveCursor({ next: 0, last: null });
    state("The next fill uses row 1.");
    await render();
  });
  byId("datasetGotoButton").addEventListener("click", async () => {
    const dataset = await getDataset();
    const number = Number(byId<HTMLInputElement>("datasetGoto").value);
    if (!dataset || !Number.isInteger(number) || number < 1 || number > dataset.rows.length) {
      return state(`Enter a row number from 1 to ${dataset?.rows.length ?? 1}.`);
    }
    await saveCursor({ next: number - 1, last: null });
    state(`The next fill uses row ${number}.`);
    await render();
  });

  // A fill or a saved row in another tab updates the position here.
  chrome.storage.onChanged.addListener((changes) => {
    if (DATASET_KEYS.some((key) => key in changes)) void render();
  });
  void render();
}
