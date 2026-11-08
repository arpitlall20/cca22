import { connectionStatus, type AppConfig } from "../config.js";
import { DynamicsClient } from "../dynamics/client.js";
import {
  sampleInvoices,
  samplePeople,
  samplePersonBundle,
  sampleReceipts,
  sampleSubscriptions,
} from "../fixtures/sample.js";
import { toInvoice, toReceipt, toStudent, toSubscription } from "../mapping/normalize.js";
import { SwiftFoxClient } from "../swiftfox/client.js";
import type {
  CanonicalInvoice,
  CanonicalReceipt,
  CanonicalStudent,
  CanonicalSubscription,
  EntityKind,
  SyncRunResult,
} from "../types.js";
import { recordHash } from "./hash.js";
import { SyncStore } from "./store.js";

function emptyCounts(): SyncRunResult["counts"] {
  const zero = { pulled: 0, upserted: 0, skipped: 0, failed: 0 };
  return {
    student: { ...zero },
    invoice: { ...zero },
    receipt: { ...zero },
    subscription: { ...zero },
  };
}

export class SyncEngine {
  constructor(
    private readonly config: AppConfig,
    private readonly store = new SyncStore(),
    private readonly swiftfox = SwiftFoxClient.fromConfig(config),
    private readonly dynamics = DynamicsClient.fromConfig(config),
  ) {}

  snapshot() {
    const state = this.store.load();
    const connections = connectionStatus(this.config);
    const outstandingCents = state.invoices.reduce((sum, invoice) => sum + invoice.outstandingCents, 0);
    return {
      connections,
      lastRun: state.lastRun ?? null,
      counts: {
        students: state.students.length,
        invoices: state.invoices.length,
        receipts: state.receipts.length,
        subscriptions: state.subscriptions.length,
        outstandingCents,
        failedLinks: state.links.filter((link) => link.status === "failed").length,
        syncedLinks: state.links.filter((link) => link.status === "synced").length,
      },
      students: state.students,
      invoices: state.invoices,
      receipts: state.receipts,
      subscriptions: state.subscriptions,
      links: state.links,
      activity: state.activity,
    };
  }

  async run(options: { force?: boolean; studentId?: string } = {}): Promise<SyncRunResult> {
    const startedAt = new Date().toISOString();
    const connections = connectionStatus(this.config);
    const state = this.store.load();
    const counts = emptyCounts();
    const errors: string[] = [];
    const dynamicsLive = connections.dynamics.mode === "live";

    const bundles = options.studentId
      ? [await this.pullStudent(options.studentId, connections.swiftfox.mode === "live")]
      : await this.pullAll(connections.swiftfox.mode === "live");

    const students: CanonicalStudent[] = [];
    const invoices: CanonicalInvoice[] = [];
    const receipts: CanonicalReceipt[] = [];
    const subscriptions: CanonicalSubscription[] = [];

    for (const bundle of bundles) {
      if (!bundle) continue;
      students.push(bundle.student);
      invoices.push(...bundle.invoices);
      receipts.push(...bundle.receipts);
      subscriptions.push(...bundle.subscriptions);
    }

    counts.student.pulled = students.length;
    counts.invoice.pulled = invoices.length;
    counts.receipt.pulled = receipts.length;
    counts.subscription.pulled = subscriptions.length;

    const grouped = new Map<string, {
      student: CanonicalStudent;
      invoices: CanonicalInvoice[];
      receipts: CanonicalReceipt[];
      subscriptions: CanonicalSubscription[];
    }>();
    for (const student of students) {
      grouped.set(student.swiftfoxId, { student, invoices: [], receipts: [], subscriptions: [] });
    }
    for (const invoice of invoices) grouped.get(invoice.studentSwiftfoxId ?? "")?.invoices.push(invoice);
    for (const receipt of receipts) grouped.get(receipt.studentSwiftfoxId ?? "")?.receipts.push(receipt);
    for (const subscription of subscriptions) {
      grouped.get(subscription.studentSwiftfoxId ?? "")?.subscriptions.push(subscription);
    }

    for (const bundle of grouped.values()) {
      try {
        const hash = recordHash(bundle);
        const existing = state.links.find(
          (link) => link.kind === "student" && link.swiftfoxId === bundle.student.swiftfoxId,
        );
        if (!options.force && existing?.lastHash === hash && existing.status === "synced") {
          counts.student.skipped += 1;
          continue;
        }

        let contactId = existing?.dynamicsId;
        if (dynamicsLive) {
          contactId = await this.dynamics.upsertContact(bundle.student);
          for (const invoice of bundle.invoices) {
            await this.dynamics.upsertInvoice(invoice, contactId);
          }
        }

        const writes = this.dynamics.plannedWrites({ ...bundle, contactId });
        this.store.upsertLink(state, {
          kind: "student",
          swiftfoxId: bundle.student.swiftfoxId,
          dynamicsId: contactId ?? `dry-run:${bundle.student.swiftfoxId}`,
          dynamicsEntity: "contact",
          status: "synced",
          lastHash: hash,
          lastSyncedAt: new Date().toISOString(),
          dryRun: !dynamicsLive,
        });
        this.markChildren(state, "invoice", bundle.invoices, dynamicsLive);
        this.markChildren(state, "receipt", bundle.receipts, dynamicsLive);
        this.markChildren(state, "subscription", bundle.subscriptions, dynamicsLive);
        counts.student.upserted += 1;
        counts.invoice.upserted += bundle.invoices.length;
        counts.receipt.upserted += bundle.receipts.length;
        counts.subscription.upserted += bundle.subscriptions.length;
        this.store.pushActivity(state, {
          kind: "student",
          action: dynamicsLive ? "upsert" : "dry-run",
          ok: true,
          message: `${bundle.student.fullName} → Dynamics contact (${writes.length} writes)`,
          detail: { swiftfoxId: bundle.student.swiftfoxId, contactId, writes: writes.length },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${bundle.student.fullName}: ${message}`);
        counts.student.failed += 1;
        this.store.upsertLink(state, {
          kind: "student",
          swiftfoxId: bundle.student.swiftfoxId,
          status: "failed",
          lastError: message,
          lastSyncedAt: new Date().toISOString(),
        });
        this.store.pushActivity(state, {
          kind: "student",
          action: "upsert",
          ok: false,
          message,
          detail: { swiftfoxId: bundle.student.swiftfoxId },
        });
      }
    }

    const next = this.store.replaceRecords(state, { students, invoices, receipts, subscriptions });
    const finishedAt = new Date().toISOString();
    next.lastRun = {
      startedAt,
      finishedAt,
      mode: { swiftfox: connections.swiftfox.mode, dynamics: connections.dynamics.mode },
      counts,
      errors,
    };
    this.store.pushActivity(next, {
      kind: "system",
      action: "sync",
      ok: errors.length === 0,
      message: errors.length
        ? `Sync finished with ${errors.length} error(s)`
        : `Synced ${students.length} students from ${connections.swiftfox.mode} SwiftFox`,
    });
    this.store.save(next);
    return next.lastRun;
  }

  private markChildren(
    state: ReturnType<SyncStore["load"]>,
    kind: EntityKind,
    records: Array<{ swiftfoxId: string }>,
    dynamicsLive: boolean,
  ) {
    for (const record of records) {
      this.store.upsertLink(state, {
        kind,
        swiftfoxId: record.swiftfoxId,
        status: "synced",
        lastSyncedAt: new Date().toISOString(),
        dryRun: !dynamicsLive,
        dynamicsEntity: kind === "invoice" ? "invoice" : "annotation",
      });
    }
  }

  private async pullAll(live: boolean) {
    if (!live) {
      return samplePeople.map((person) => this.fromSample(String(person.id))).filter(Boolean);
    }
    const people = await this.swiftfox.listPeople();
    const bundles = [];
    for (const person of people) {
      bundles.push(await this.pullLivePerson(person.id ?? ""));
    }
    return bundles;
  }

  private async pullStudent(id: string, live: boolean) {
    if (!live) return this.fromSample(id);
    return this.pullLivePerson(id);
  }

  private fromSample(id: string) {
    const bundle = samplePersonBundle(id);
    if (!bundle) return undefined;
    return {
      student: toStudent(bundle.person),
      invoices: bundle.invoices.map((invoice) => toInvoice(invoice, id)),
      receipts: bundle.receipts.map((receipt) => toReceipt(receipt, id)),
      subscriptions: bundle.subscriptions.map((subscription) => toSubscription(subscription, id)),
    };
  }

  private async pullLivePerson(id: string | number) {
    const person = await this.swiftfox.getPerson(id);
    const student = toStudent({ ...person, id: person.id ?? id });
    const studentId = student.swiftfoxId;
    const [invoicesPage, receiptsPage, subscriptionsPage] = await Promise.all([
      this.swiftfox.listPersonInvoices(id),
      this.swiftfox.listPersonReceipts(id),
      this.swiftfox.listPersonSubscriptions(id),
    ]);
    const invoiceOverviews = invoicesPage.items ?? [];
    const invoices: CanonicalInvoice[] = [];
    for (const overview of invoiceOverviews) {
      try {
        invoices.push(toInvoice(await this.swiftfox.getInvoice(overview.id), studentId));
      } catch {
        invoices.push(toInvoice(overview, studentId));
      }
    }
    return {
      student,
      invoices,
      receipts: (receiptsPage.items ?? []).map((receipt) => toReceipt(receipt, studentId)),
      subscriptions: (subscriptionsPage.items ?? []).map((subscription) => toSubscription(subscription, studentId)),
    };
  }
}

export function sampleCatalog() {
  return {
    people: samplePeople,
    invoices: sampleInvoices,
    receipts: sampleReceipts,
    subscriptions: sampleSubscriptions,
  };
}
