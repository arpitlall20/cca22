export type ConnectionState = {
  swiftfox: { mode: string; baseUrl: string; authenticated: boolean };
  dynamics: { mode: string; orgUrl: string | null; authenticated: boolean };
};

export type Student = {
  swiftfoxId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: string;
  addresses: Array<{ locality?: string; state?: string }>;
};

export type Invoice = {
  swiftfoxId: string;
  studentSwiftfoxId?: string;
  number?: string;
  reference?: string;
  status: string;
  date?: string;
  due?: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
};

export type Receipt = {
  swiftfoxId: string;
  studentSwiftfoxId?: string;
  receiptNo?: string;
  effectiveDate?: string;
  method?: string;
  success: boolean;
  refunded: boolean;
  currency: string;
  amountCents: number;
};

export type Subscription = {
  swiftfoxId: string;
  studentSwiftfoxId?: string;
  status: string;
  planName?: string;
  method?: string;
  autoRenew: boolean;
  paidTo?: string;
  nextAttempt?: string;
  feeCents?: number;
  arrearsCents?: number;
  currency: string;
};

export type FieldMap = {
  domain: string;
  swiftfox: string;
  swiftfoxPath: string;
  dynamics: string;
  dynamicsEntity: string;
  transform?: string;
  notes?: string;
  required?: boolean;
};

export type Activity = {
  id: string;
  at: string;
  kind: string;
  action: string;
  message: string;
  ok: boolean;
};

export type StatusPayload = {
  connections: ConnectionState;
  formattedOutstanding: string;
  lastRun: {
    startedAt: string;
    finishedAt: string;
    mode: { swiftfox: string; dynamics: string };
    counts: Record<string, { pulled: number; upserted: number; skipped: number; failed: number }>;
    errors: string[];
  } | null;
  counts: {
    students: number;
    invoices: number;
    receipts: number;
    subscriptions: number;
    outstandingCents: number;
    failedLinks: number;
    syncedLinks: number;
  };
  students: Student[];
  invoices: Invoice[];
  receipts: Receipt[];
  subscriptions: Subscription[];
  activity: Activity[];
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  return response.json() as Promise<T>;
}

export function fetchStatus() {
  return getJson<StatusPayload>("/api/status");
}

export function fetchMapping() {
  return getJson<{ fields: FieldMap[]; systemOfRecord: string; destination: string }>("/api/mapping");
}

export async function runSync(force = true) {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  if (!response.ok) throw new Error(`Sync failed (${response.status})`);
  return response.json();
}
