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
  | { type: "error"; message: string; rejectedText?: string };

export type WebviewToHostMessage =
  | { type: "ready" }
  | { type: "update"; text: string; baseText?: string }
  | { type: "save"; expectedText?: string }
  | { type: "showMessage"; message: string };

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "ready") return true;
  if (message.type === "save") return message.expectedText === undefined || typeof message.expectedText === "string";
  if (message.type === "update") return typeof message.text === "string"
    && (message.baseText === undefined || typeof message.baseText === "string");
  if (message.type === "showMessage") return typeof message.message === "string";
  return false;
}

export function isHostToWebviewMessage(value: unknown): value is HostToWebviewMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "error") return typeof message.message === "string"
    && (message.rejectedText === undefined || typeof message.rejectedText === "string");
  if (message.type !== "document") return false;
  return typeof message.text === "string"
    && (message.data === null || (typeof message.data === "object" && !Array.isArray(message.data)))
    && Array.isArray(message.issues)
    && message.issues.every((issue) => typeof issue === "string")
    && typeof message.rawMode === "boolean"
    && typeof message.showHiddenSheets === "boolean";
}
