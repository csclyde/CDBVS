import type { CdbDatabase } from "../cdb/types";

export type HostToWebviewMessage =
  | {
      type: "document";
      text: string;
      data: CdbDatabase | null;
      issues: string[];
      rawMode: boolean;
      showHiddenSheets: boolean;
    }
  | { type: "error"; message: string };

export type WebviewToHostMessage =
  | { type: "ready" }
  | { type: "update"; text: string }
  | { type: "save" }
  | { type: "showMessage"; message: string };

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "ready" || message.type === "save") return true;
  if (message.type === "update") return typeof message.text === "string";
  if (message.type === "showMessage") return typeof message.message === "string";
  return false;
}

export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "error") return typeof message.message === "string";
  if (message.type !== "document") return false;
  return typeof message.text === "string"
    && (message.data === null || (typeof message.data === "object" && !Array.isArray(message.data)))
    && Array.isArray(message.issues)
    && message.issues.every((issue) => typeof issue === "string")
    && typeof message.rawMode === "boolean"
    && typeof message.showHiddenSheets === "boolean";
}
