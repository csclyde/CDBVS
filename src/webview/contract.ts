import type { CdbDatabase } from "../cdb/types";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../shared/protocol";

export interface WebviewState {
  text: string;
  data: CdbDatabase | null;
  issues: string[];
  sheetIndex: number;
  rawMode: boolean;
  showHiddenSheets: boolean;
  [key: string]: any;
}

export interface CdbvsWebviewApi {
  vscode: { postMessage(message: WebviewToHostMessage): void };
  app: HTMLElement | null;
  state: WebviewState;
  [key: string]: any;
}

declare global {
  interface Window {
    CDBVS?: CdbvsWebviewApi;
    acquireVsCodeApi(): { postMessage(message: WebviewToHostMessage): void };
  }
}

export type { HostToWebviewMessage };
