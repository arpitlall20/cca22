export type SwiftFoxPerson = {
  id?: number | string;
  firstName?: string;
  lastName?: string;
  knownAs?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  dob?: string;
  dateOfBirth?: string;
  updatedOn?: string;
  createdOn?: string;
  contacts?: Array<{ type?: string; value?: string; primary?: boolean }>;
  addresses?: Array<{
    type?: string;
    address1?: string;
    building?: string;
    locality?: string;
    state?: string;
    postCode?: string;
    country?: string;
  }>;
  [key: string]: unknown;
};

export type SwiftFoxInvoiceOverview = {
  id: number;
  createdOn?: string;
  currency?: string;
  date?: string;
  ownerId?: string;
  ownerType?: string;
  status?: string;
  totalAmount?: number;
  totalPaidAmount?: number;
  totalPendingAmount?: number;
  who?: string;
  integrationInvoiceNumber?: string;
};

export type SwiftFoxInvoice = SwiftFoxInvoiceOverview & {
  due?: string;
  reference?: string;
  totalAmountPreTax?: number;
  totalTaxAmount?: number;
  balanceOutstanding?: number;
  lineItems?: Array<{
    id?: number;
    itemCode?: string;
    comment?: string;
    quantity?: number;
    unitAmount?: number;
    amount?: number;
    taxAmount?: number;
    item?: { name?: string; code?: string };
  }>;
  receiptAllocations?: Array<{ receiptId?: number; amount?: number }>;
};

export type SwiftFoxReceipt = {
  id: number;
  createdOn?: string;
  effectiveDate?: string;
  description?: string;
  refunded?: boolean;
  transactionRef?: string;
  receiptNo?: string;
  method?: string;
  provider?: string;
  status?: string;
  success?: boolean;
  pending?: boolean;
  currency?: string;
  ownerType?: string;
  ownerId?: string;
  direction?: string;
  lineItems?: Array<{
    id?: number;
    amount?: number;
    comment?: string;
    subscriptionId?: number;
    invoiceId?: number;
  }>;
};

export type SwiftFoxSubscription = {
  id: number;
  status?: string;
  method?: string;
  provider?: string;
  nominatedFee?: number;
  paidTo?: string;
  nextAttempt?: string;
  autoRenew?: boolean;
  arrears?: number;
  start?: string;
  end?: string;
  fee?: {
    id?: number;
    fee?: number;
    renewalFee?: number;
    currency?: string;
    plan?: { name?: string; category?: string };
  };
};

export type Paginated<T> = {
  items?: T[];
  pageNumber?: number;
  pageSize?: number;
  totalResults?: number;
};
