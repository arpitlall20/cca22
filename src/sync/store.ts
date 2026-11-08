import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ActivityEvent,
  CanonicalInvoice,
  CanonicalReceipt,
  CanonicalStudent,
  CanonicalSubscription,
  RecordLink,
  SyncRunResult,
} from "../types.js";

export type SyncState = {
  students: CanonicalStudent[];
  invoices: CanonicalInvoice[];
  receipts: CanonicalReceipt[];
  subscriptions: CanonicalSubscription[];
  links: RecordLink[];
  activity: ActivityEvent[];
  lastRun?: SyncRunResult;
};

const empty = (): SyncState => ({
  students: [],
  invoices: [],
  receipts: [],
  subscriptions: [],
  links: [],
  activity: [],
});

function defaultPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "data", "state.json");
}

export class SyncStore {
  constructor(private readonly filePath = defaultPath()) {}

  load(): SyncState {
    try {
      return { ...empty(), ...JSON.parse(readFileSync(this.filePath, "utf8")) };
    } catch {
      return empty();
    }
  }

  save(state: SyncState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  replaceRecords(
    state: SyncState,
    records: {
      students: CanonicalStudent[];
      invoices: CanonicalInvoice[];
      receipts: CanonicalReceipt[];
      subscriptions: CanonicalSubscription[];
    },
  ): SyncState {
    return { ...state, ...records };
  }

  upsertLink(state: SyncState, link: RecordLink): void {
    const index = state.links.findIndex((item) => item.kind === link.kind && item.swiftfoxId === link.swiftfoxId);
    if (index >= 0) state.links[index] = { ...state.links[index], ...link };
    else state.links.push(link);
  }

  pushActivity(state: SyncState, event: Omit<ActivityEvent, "id" | "at"> & { id?: string; at?: string }): void {
    state.activity.unshift({
      id: event.id ?? crypto.randomUUID(),
      at: event.at ?? new Date().toISOString(),
      kind: event.kind,
      action: event.action,
      message: event.message,
      ok: event.ok,
      detail: event.detail,
    });
    state.activity = state.activity.slice(0, 200);
  }
}
