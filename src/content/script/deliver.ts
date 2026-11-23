import { fileStem } from "../../shared/script/escape";
import { GENERATORS } from "../../shared/script";
import { ScriptFramework } from "../../shared/types";
import { copyText } from "../report";
import { showToast } from "../toast";
import { lastScript } from "./actions";

interface ScriptMessage {
  framework: ScriptFramework;
  output: "copy" | "text" | "file" | "data";
  csv?: { name: string; text: string };
}

/** A download made in the page, so the extension needs no downloads permission. */
function download(name: string, text: string, type: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = name;
  link.style.display = "none";
  document.documentElement.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Turns the last fill on this page into a script, then copies it, downloads it, or returns it to the popup. */
export async function handleScript({ framework, output, csv }: ScriptMessage): Promise<{ done: boolean; text?: string }> {
  const generator = GENERATORS[framework] ?? GENERATORS.playwright;
  const { actions, url } = lastScript();
  if (!actions.length) {
    if (output !== "text") showToast("Nothing to turn into a script yet. Fill the form first.");
    return { done: false };
  }
  const fields = `${actions.length} ${actions.length === 1 ? "field" : "fields"}`;

  if (output === "text") return { done: true, text: generator.steps(actions) };
  if (output === "copy") {
    const copied = await copyText(generator.steps(actions));
    showToast(copied ? `Copied ${generator.name} steps for ${fields}` : "Could not copy. Try the popup's Copy test script button.");
    return { done: copied };
  }

  const stem = `fill-${fileStem(document.title || url)}`;
  if (output === "data") {
    if (!csv) {
      showToast("No dataset yet. Add one in Options, under Datasets.");
      return { done: false };
    }
    if (!actions.some(({ column }) => column)) {
      showToast("Fill from the dataset first, so the test knows which column fills which field.");
      return { done: false };
    }
    const csvName = csv.name.replace(/\.(xlsx|csv|tsv|txt)$/i, "") + ".csv";
    download(`${stem}-data.${generator.extension}`, generator.file(actions, { url, csvName }), "text/plain");
    download(csvName, `﻿${csv.text}`, "text/csv");
    showToast(`Downloaded a ${generator.name} test that runs once per row, with ${csvName}`);
    return { done: true };
  }
  download(`${stem}.${generator.extension}`, generator.file(actions, { url }), "text/plain");
  showToast(`Downloaded a ${generator.name} test for ${fields}`);
  return { done: true };
}
