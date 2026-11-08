import { describe, expect, it } from "vitest";
import { mapInvoiceStatus } from "../src/mapping/catalog.js";
import { toInvoice, toReceipt, toStudent, toSubscription } from "../src/mapping/normalize.js";
import { centsToMajor, formatMoney } from "../src/money.js";

describe("money", () => {
  it("treats SwiftFox integer amounts as cents", () => {
    expect(centsToMajor(18500, "AUD")).toBe(185);
    expect(formatMoney(9000, "AUD")).toContain("90");
  });
});

describe("student mapping", () => {
  it("prefers explicit email then contact list", () => {
    const student = toStudent({
      id: 7,
      firstName: "Ada",
      lastName: "Khan",
      contacts: [{ type: "email", value: "ada@example.edu" }],
      addresses: [{ locality: "Carlton", state: "VIC", postCode: "3053", country: "AU" }],
    });
    expect(student.swiftfoxId).toBe("7");
    expect(student.fullName).toBe("Ada Khan");
    expect(student.email).toBe("ada@example.edu");
    expect(student.addresses[0]?.locality).toBe("Carlton");
  });
});

describe("invoice mapping", () => {
  it("keeps invoice-first balances in cents", () => {
    const invoice = toInvoice(
      {
        id: 12,
        ownerId: "7",
        status: "PART_PAID",
        currency: "AUD",
        totalAmount: 18500,
        totalPaidAmount: 9000,
        balanceOutstanding: 9500,
        integrationInvoiceNumber: "INV-12",
        lineItems: [{ id: 1, amount: 18500, comment: "Membership", quantity: 1 }],
      },
      "7",
    );
    expect(invoice.number).toBe("INV-12");
    expect(invoice.outstandingCents).toBe(9500);
    expect(invoice.lineItems[0]?.description).toBe("Membership");
    expect(mapInvoiceStatus(invoice.status)).toEqual({ state: "Active", status: "Partial" });
  });

  it("maps paid and voided statuses", () => {
    expect(mapInvoiceStatus("PAID").state).toBe("Closed");
    expect(mapInvoiceStatus("VOIDED").state).toBe("Canceled");
  });
});

describe("receipt and subscription mapping", () => {
  it("sums receipt lines and keeps invoice links", () => {
    const receipt = toReceipt(
      {
        id: 3,
        receiptNo: "RCT-3",
        success: true,
        currency: "AUD",
        lineItems: [{ amount: 4000, invoiceId: 12 }, { amount: 500, invoiceId: 12 }],
      },
      "7",
    );
    expect(receipt.amountCents).toBe(4500);
    expect(receipt.invoiceIds).toEqual(["12", "12"]);
  });

  it("copies plan metadata onto the canonical subscription", () => {
    const subscription = toSubscription(
      {
        id: 9,
        status: "ACTIVE",
        autoRenew: true,
        arrears: 0,
        fee: { fee: 18500, currency: "AUD", plan: { name: "Full student membership", category: "Membership" } },
      },
      "7",
    );
    expect(subscription.planName).toBe("Full student membership");
    expect(subscription.feeCents).toBe(18500);
    expect(subscription.studentSwiftfoxId).toBe("7");
  });
});
