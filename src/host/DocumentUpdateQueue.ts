/** Serializes document writes so rapid webview edits cannot race each other. */
export class DocumentUpdateQueue {
  private pending: Promise<void> = Promise.resolve();

  enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.pending.then(task, task);
    // Keep the queue usable after an individual update fails. The caller still
    // receives the rejection, while later updates and Save can proceed.
    this.pending = run.then(() => undefined, () => undefined);
    return run;
  }

  wait(): Promise<void> {
    return this.pending;
  }
}
