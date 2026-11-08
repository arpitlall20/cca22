import { pickNumber, pickString } from "../http.js";
import { sumCents } from "../money.js";
import type {
  Address,
  CanonicalInvoice,
  CanonicalReceipt,
  CanonicalStudent,
  CanonicalSubscription,
  ContactPoint,
} from "../types.js";
import type {
  SwiftFoxInvoice,
  SwiftFoxInvoiceOverview,
  SwiftFoxPerson,
  SwiftFoxReceipt,
  SwiftFoxSubscription,
} from "../swiftfox/types.js";

function idOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function contactValue(person: SwiftFoxPerson, type: string): string | undefined {
  const match = (person.contacts ?? []).find((item) => (item.type ?? "").toLowerCase().includes(type));
  return pickString(match?.value);
}

export function toStudent(person: SwiftFoxPerson): CanonicalStudent {
  const firstName = pickString(person.firstName, person.knownAs) ?? "";
  const lastName = pickString(person.lastName) ?? "";
  const email = pickString(person.email, contactValue(person, "email"));
  const phone = pickString(person.phone, contactValue(person, "phone"));
  const mobile = pickString(person.mobile, contactValue(person, "mobile"));
  const addresses: Address[] = (person.addresses ?? []).map((address) => ({
    type: address.type,
    line1: address.address1,
    building: address.building,
    locality: address.locality,
    state: address.state,
    postCode: address.postCode,
    country: address.country,
  }));
  const contacts: ContactPoint[] = person.contacts ?? [];
  return {
    swiftfoxId: idOf(person.id),
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    email,
    phone,
    mobile,
    dateOfBirth: pickString(person.dob, person.dateOfBirth),
    addresses,
    contacts,
    sourceUpdatedAt: pickString(person.updatedOn, person.createdOn),
  };
}

export function toInvoice(
  invoice: SwiftFoxInvoice | SwiftFoxInvoiceOverview,
  studentSwiftfoxId?: string,
): CanonicalInvoice {
  const detailed = invoice as SwiftFoxInvoice;
  const lineItems = (detailed.lineItems ?? []).map((line) => ({
    id: line.id !== undefined ? String(line.id) : undefined,
    itemCode: pickString(line.itemCode, line.item?.code),
    description: pickString(line.comment, line.item?.name),
    quantity: line.quantity ?? 1,
    unitAmountCents: Math.round((line.unitAmount ?? 0) * (Number.isInteger(line.unitAmount) ? 1 : 100)) || (line.amount ?? 0),
    amountCents: line.amount ?? 0,
    taxAmountCents: line.taxAmount ?? 0,
  }));
  const totalCents = invoice.totalAmount ?? sumCents(lineItems.map((line) => line.amountCents));
  const paidCents = invoice.totalPaidAmount ?? 0;
  return {
    swiftfoxId: idOf(invoice.id),
    studentSwiftfoxId: studentSwiftfoxId ?? invoice.ownerId,
    ownerType: invoice.ownerType,
    number: pickString(invoice.integrationInvoiceNumber, `SFX-${invoice.id}`),
    reference: pickString(detailed.reference, invoice.who),
    status: (invoice.status ?? "AUTHORISED").toUpperCase(),
    date: invoice.date,
    due: detailed.due,
    currency: invoice.currency || "AUD",
    totalCents,
    paidCents,
    outstandingCents: detailed.balanceOutstanding ?? Math.max(totalCents - paidCents, 0),
    taxCents: detailed.totalTaxAmount ?? 0,
    integrationInvoiceNumber: invoice.integrationInvoiceNumber,
    lineItems,
  };
}

export function toReceipt(receipt: SwiftFoxReceipt, studentSwiftfoxId?: string): CanonicalReceipt {
  const amountCents = sumCents((receipt.lineItems ?? []).map((line) => line.amount));
  const invoiceIds = (receipt.lineItems ?? [])
    .map((line) => line.invoiceId)
    .filter((id): id is number => id !== undefined)
    .map(String);
  return {
    swiftfoxId: idOf(receipt.id),
    studentSwiftfoxId: studentSwiftfoxId ?? receipt.ownerId,
    receiptNo: receipt.receiptNo,
    effectiveDate: receipt.effectiveDate,
    method: receipt.method,
    provider: receipt.provider,
    status: receipt.status,
    success: Boolean(receipt.success),
    pending: Boolean(receipt.pending),
    refunded: Boolean(receipt.refunded),
    currency: receipt.currency || "AUD",
    amountCents,
    direction: receipt.direction,
    transactionRef: receipt.transactionRef,
    invoiceIds,
  };
}

export function toSubscription(
  subscription: SwiftFoxSubscription,
  studentSwiftfoxId?: string,
): CanonicalSubscription {
  return {
    swiftfoxId: idOf(subscription.id),
    studentSwiftfoxId,
    status: (subscription.status ?? "ACTIVE").toUpperCase(),
    planName: subscription.fee?.plan?.name,
    planCategory: subscription.fee?.plan?.category,
    method: subscription.method,
    autoRenew: Boolean(subscription.autoRenew),
    start: subscription.start,
    end: subscription.end,
    paidTo: subscription.paidTo,
    nextAttempt: subscription.nextAttempt,
    feeCents: pickNumber(subscription.nominatedFee, subscription.fee?.fee),
    arrearsCents: subscription.arrears ?? 0,
    currency: subscription.fee?.currency || "AUD",
  };
}
