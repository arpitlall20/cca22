export type EntityKind = "student" | "invoice" | "receipt" | "subscription";
export type SyncDirection = "swiftfox-to-dynamics";
export type MappingStatus = "pending" | "synced" | "failed" | "skipped";

export type Money = {
  /** Integer minor units as returned by SwiftFox (cents). */
  cents: number;
  currency: string;
};

export type Address = {
  type?: string;
  line1?: string;
  building?: string;
  locality?: string;
  state?: string;
  postCode?: string;
  country?: string;
};

export type ContactPoint = {
  type?: string;
  value?: string;
  primary?: boolean;
};

export type CanonicalStudent = {
  swiftfoxId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  dateOfBirth?: string;
  addresses: Address[];
  contacts: ContactPoint[];
  sourceUpdatedAt?: string;
};

export type CanonicalInvoiceLine = {
  id?: string;
  itemCode?: string;
  description?: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
  taxAmountCents: number;
};

export type CanonicalInvoice = {
  swiftfoxId: string;
  studentSwiftfoxId?: string;
  ownerType?: string;
  number?: string;
  reference?: string;
  status: string;
  date?: string;
  due?: string;
  currency: string;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  taxCents: number;
  integrationInvoiceNumber?: string;
  lineItems: CanonicalInvoiceLine[];
};

export type CanonicalReceipt = {
  swiftfoxId: string;
  studentSwiftfoxId?: string;
  receiptNo?: string;
  effectiveDate?: string;
  method?: string;
  provider?: string;
  status?: string;
  success: boolean;
  pending: boolean;
  refunded: boolean;
  currency: string;
  amountCents: number;
  direction?: string;
  transactionRef?: string;
  invoiceIds: string[];
};

export type CanonicalSubscription = {
  swiftfoxId: string;
  studentSwiftfoxId?: string;
  status: string;
  planName?: string;
  planCategory?: string;
  method?: string;
  autoRenew: boolean;
  start?: string;
  end?: string;
  paidTo?: string;
  nextAttempt?: string;
  feeCents?: number;
  arrearsCents?: number;
  currency: string;
};

export type RecordLink = {
  kind: EntityKind;
  swiftfoxId: string;
  dynamicsId?: string;
  dynamicsEntity?: string;
  status: MappingStatus;
  lastHash?: string;
  lastSyncedAt?: string;
  lastError?: string;
  dryRun?: boolean;
};

export type ActivityEvent = {
  id: string;
  at: string;
  kind: EntityKind | "system" | "webhook";
  action: string;
  message: string;
  ok: boolean;
  detail?: Record<string, unknown>;
};

export type SyncRunResult = {
  startedAt: string;
  finishedAt: string;
  mode: { swiftfox: string; dynamics: string };
  counts: Record<EntityKind, { pulled: number; upserted: number; skipped: number; failed: number }>;
  errors: string[];
};

export type FieldMap = {
  domain: "student" | "invoice" | "receipt" | "subscription";
  swiftfox: string;
  swiftfoxPath: string;
  dynamics: string;
  dynamicsEntity: string;
  transform?: string;
  notes?: string;
  required?: boolean;
};
