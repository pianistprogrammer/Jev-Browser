import type { ActionEnvelope, ActionKind, PageElement, Task } from "@jev/contracts";
import type { BrowserToolArguments } from "../providers/types.js";
import { validateNavigationUrl } from "./navigation.js";

const textInputTypes = new Set(["", "search", "text", "url", "tel"]);
const blockedField = /password|passcode|credential|credit.?card|card number|cvv|security code|social security|ssn|bank|routing|account number/i;
const blockedButton = /buy|purchase|checkout|pay|place order|submit|send|post|publish|delete|remove|transfer/i;
const keys = new Set(["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Backspace", "Delete", "Space", " "]);
const keyAliases: Record<string, string> = {
  return: "Enter", esc: "Escape", escape: "Escape",
  arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
  pageup: "PageUp", pagedown: "PageDown",
  backspace: "Backspace", delete: "Delete", space: "Space", home: "Home", end: "End",
};

function element(task: Task, ref: string, permitted: (value: PageElement) => boolean): PageElement {
  const match = task.observation?.elements?.find(value => value.ref === ref && !value.disabled && permitted(value));
  if (!match) throw new Error("Tool arguments must reference a currently visible element permitted by the browser safety policy.");
  return match;
}

function exactArgs(args: Record<string, string>, allowed: string[]) {
  if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error("Tool arguments included unsupported fields.");
}

export function validateToolArguments(task: Task, kind: ActionKind, generated: BrowserToolArguments): ActionEnvelope {
  const args = generated.args;
  switch (kind) {
    case "browser_open": {
      exactArgs(args, ["url"]);
      const raw = generated.target ?? args.url ?? "";
      // If the model returned a plain query instead of a URL, convert to a Google search.
      let url: string;
      try {
        url = validateNavigationUrl(raw, false).href;
      } catch {
        const asSearch = `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
        url = validateNavigationUrl(asSearch, false).href;
      }
      return { kind, target: url, args: {}, requiresApproval: false };
    }
    case "extract":
    case "browser_snapshot":
      exactArgs(args, []);
      return { kind, args: {}, requiresApproval: false };
    case "browser_click": {
      exactArgs(args, ["ref"]);
      const target = element(task, args.ref ?? "", value => value.kind === "link" || (value.kind === "button" && !blockedButton.test(value.label)));
      if (blockedButton.test(target.label)) throw new Error("The requested click could submit, post, purchase, or otherwise mutate data.");
      return { kind, args: { ref: target.ref }, requiresApproval: false };
    }
    case "browser_type": {
      exactArgs(args, ["ref", "text", "submit"]);
      const target = element(task, args.ref ?? "", value => ["input", "textarea", "contenteditable"].includes(value.kind) && textInputTypes.has(value.inputType ?? "") && !blockedField.test(value.label));
      const text = args.text?.trim();
      if (!text || text.length > 1000) throw new Error("Typed text must be between 1 and 1000 characters.");
      const submit = args.submit ?? "false";
      if (!["true", "false"].includes(submit)) throw new Error("Submit must be true or false.");
      return { kind, args: { ref: target.ref, text, submit }, requiresApproval: false };
    }
    case "browser_key": {
      exactArgs(args, ["key"]);
      const raw = args.key ?? "";
      const normalized = keyAliases[raw.toLowerCase()] ?? raw;
      if (!keys.has(normalized)) throw new Error(`The requested keyboard key "${raw}" is not permitted. Use one of: Enter, Escape, Tab, ArrowUp, ArrowDown, PageUp, PageDown.`);
      return { kind, args: { key: normalized }, requiresApproval: false };
    }
    case "browser_scroll": {
      exactArgs(args, ["pixels"]);
      const pixels = Number(args.pixels);
      if (!Number.isInteger(pixels) || pixels === 0 || Math.abs(pixels) > 1600) throw new Error("Scroll distance must be a non-zero integer between -1600 and 1600.");
      return { kind, args: { pixels: String(pixels) }, requiresApproval: false };
    }
    case "browser_switch_tab": {
      exactArgs(args, ["index"]);
      const index = Number(args.index);
      if (!Number.isInteger(index) || !task.observation?.tabs?.some(tab => tab.index === index && !tab.active)) throw new Error("The requested tab is not available in the latest browser observation.");
      return { kind, args: { index: String(index) }, requiresApproval: false };
    }
    default:
      throw new Error("This tool cannot be executed by the browser.");
  }
}
