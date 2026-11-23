import { ScriptFramework } from "../types";
import { cypress } from "./cypress";
import { playwright } from "./playwright";
import { seleniumJava } from "./seleniumJava";
import { seleniumPython } from "./seleniumPython";
import { ScriptGenerator } from "./types";

export const GENERATORS: Readonly<Record<ScriptFramework, ScriptGenerator>> = { playwright, cypress, seleniumPython, seleniumJava };

export const SCRIPT_FRAMEWORKS = Object.keys(GENERATORS) as ScriptFramework[];
