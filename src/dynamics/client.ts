import { HttpError, requestJson } from "../http.js";
import type { AppConfig } from "../config.js";
import type {
  CanonicalInvoice,
  CanonicalReceipt,
  CanonicalStudent,
  CanonicalSubscription,
} from "../types.js";
import { centsToMajor } from "../money.js";

export type DynamicsWrite = {
  entity: string;
  method: "POST" | "PATCH";
  path: string;
  key?: string;
  payload: Record<string, unknown>;
};

type TokenResponse = {
  access_token: string;
  expires_in: number;
};

export class DynamicsClient {
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly orgUrl: string,
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly apiVersion: string,
  ) {}

  static fromConfig(config: AppConfig): DynamicsClient {
    return new DynamicsClient(
      config.dynamicsOrgUrl,
      config.dynamicsTenantId,
      config.dynamicsClientId,
      config.dynamicsClientSecret,
      config.dynamicsApiVersion,
    );
  }

  private api(path: string): string {
    return `${this.orgUrl}/api/data/${this.apiVersion}${path}`;
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 30_000) return this.token.value;
    const scopeHost = new URL(this.orgUrl).host.replace(".api.", ".");
    const token = await requestJson<TokenResponse>(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: `https://${scopeHost}/.default`,
        }).toString(),
      },
    );
    this.token = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return this.token.value;
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.accessToken()}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      Prefer: "return=representation,odata.include-annotations=*",
    };
  }

  async whoAmI() {
    return requestJson<{ UserId?: string; OrganizationId?: string }>(this.api("/WhoAmI"), {
      headers: await this.headers(),
    });
  }

  contactPayload(student: CanonicalStudent): Record<string, unknown> {
    return {
      firstname: student.firstName,
      lastname: student.lastName,
      emailaddress1: student.email,
      telephone1: student.phone,
      mobilephone: student.mobile,
      birthdate: student.dateOfBirth,
      address1_line1: student.addresses[0]?.line1,
      address1_city: student.addresses[0]?.locality,
      address1_stateorprovince: student.addresses[0]?.state,
      address1_postalcode: student.addresses[0]?.postCode,
      address1_country: student.addresses[0]?.country,
      sfox_personid: student.swiftfoxId,
      description: `SwiftFox person ${student.swiftfoxId}`,
    };
  }

  invoicePayload(invoice: CanonicalInvoice, contactId?: string): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: invoice.number || invoice.reference || `SwiftFox ${invoice.swiftfoxId}`,
      invoicenumber: invoice.number || `SFX-${invoice.swiftfoxId}`,
      description: invoice.reference,
      datedelivered: invoice.date,
      duedate: invoice.due,
      sfox_invoiceid: invoice.swiftfoxId,
      sfox_status: invoice.status,
    };
    if (contactId) {
      payload["customerid_contact@odata.bind"] = `/contacts(${contactId})`;
    }
    return payload;
  }

  invoiceLinePayload(invoiceId: string, line: CanonicalInvoice["lineItems"][number], index: number) {
    return {
      "invoiceid@odata.bind": `/invoices(${invoiceId})`,
      productdescription: line.description || line.itemCode || `Line ${index + 1}`,
      quantity: line.quantity || 1,
      priceperunit: centsToMajor(line.unitAmountCents || line.amountCents),
      extendedamount: centsToMajor(line.amountCents),
      sfox_lineid: line.id,
    };
  }

  receiptNotePayload(receipt: CanonicalReceipt): Record<string, unknown> {
    return {
      subject: `SwiftFox receipt ${receipt.receiptNo || receipt.swiftfoxId}`,
      notetext: [
        `Receipt ${receipt.receiptNo || receipt.swiftfoxId}`,
        `Amount: ${centsToMajor(receipt.amountCents)} ${receipt.currency}`,
        `Method: ${receipt.method ?? "unknown"}`,
        `Status: ${receipt.status ?? (receipt.success ? "success" : "failed")}`,
        `Transaction: ${receipt.transactionRef ?? ""}`,
        `SwiftFox id: ${receipt.swiftfoxId}`,
      ].join("\n"),
    };
  }

  subscriptionNotePayload(subscription: CanonicalSubscription): Record<string, unknown> {
    return {
      subject: `SwiftFox subscription ${subscription.swiftfoxId}`,
      notetext: [
        `Plan: ${subscription.planName ?? "unknown"} (${subscription.planCategory ?? ""})`,
        `Status: ${subscription.status}`,
        `Fee: ${centsToMajor(subscription.feeCents ?? 0)} ${subscription.currency}`,
        `Paid to: ${subscription.paidTo ?? ""}`,
        `Next attempt: ${subscription.nextAttempt ?? ""}`,
        `Arrears: ${centsToMajor(subscription.arrearsCents ?? 0)} ${subscription.currency}`,
        `SwiftFox id: ${subscription.swiftfoxId}`,
      ].join("\n"),
    };
  }

  plannedWrites(input: {
    student: CanonicalStudent;
    contactId?: string;
    invoices: CanonicalInvoice[];
    receipts: CanonicalReceipt[];
    subscriptions: CanonicalSubscription[];
  }): DynamicsWrite[] {
    const writes: DynamicsWrite[] = [];
    const contactKey = input.student.email || input.student.swiftfoxId;
    writes.push({
      entity: "contacts",
      method: input.contactId ? "PATCH" : "POST",
      path: input.contactId ? `/contacts(${input.contactId})` : "/contacts",
      key: contactKey,
      payload: this.contactPayload(input.student),
    });
    for (const invoice of input.invoices) {
      writes.push({
        entity: "invoices",
        method: "POST",
        path: "/invoices",
        key: invoice.swiftfoxId,
        payload: this.invoicePayload(invoice, input.contactId),
      });
      invoice.lineItems.forEach((line, index) => {
        writes.push({
          entity: "invoicedetails",
          method: "POST",
          path: "/invoicedetails",
          key: line.id || `${invoice.swiftfoxId}:${index}`,
          payload: this.invoiceLinePayload(`sfx-invoice-${invoice.swiftfoxId}`, line, index),
        });
      });
    }
    for (const receipt of input.receipts) {
      writes.push({
        entity: "annotations",
        method: "POST",
        path: "/annotations",
        key: receipt.swiftfoxId,
        payload: this.receiptNotePayload(receipt),
      });
    }
    for (const subscription of input.subscriptions) {
      writes.push({
        entity: "annotations",
        method: "POST",
        path: "/annotations",
        key: subscription.swiftfoxId,
        payload: this.subscriptionNotePayload(subscription),
      });
    }
    return writes;
  }

  async findContactByEmail(email?: string): Promise<string | undefined> {
    if (!email) return undefined;
    const escaped = email.replace(/'/g, "''");
    const result = await requestJson<{ value?: Array<{ contactid: string }> }>(
      this.api("/contacts"),
      {
        headers: await this.headers(),
        query: { $select: "contactid,emailaddress1", $filter: `emailaddress1 eq '${escaped}'`, $top: 1 },
      },
    );
    return result.value?.[0]?.contactid;
  }

  async upsertContact(student: CanonicalStudent): Promise<string> {
    const existing = await this.findContactByEmail(student.email);
    if (existing) {
      await this.patch(`/contacts(${existing})`, this.contactPayload(student));
      return existing;
    }
    return this.create("/contacts", this.contactPayload(student));
  }

  async upsertInvoice(invoice: CanonicalInvoice, contactId?: string): Promise<string> {
    const existing = await this.findByCustomId("invoices", "sfox_invoiceid", invoice.swiftfoxId);
    const payload = this.invoicePayload(invoice, contactId);
    if (existing) {
      await this.patch(`/invoices(${existing})`, payload);
      return existing;
    }
    try {
      return await this.create("/invoices", payload);
    } catch (error) {
      if (error instanceof HttpError && error.status === 400 && "sfox_invoiceid" in payload) {
        const fallback = { ...payload };
        delete fallback.sfox_invoiceid;
        delete fallback.sfox_status;
        return this.create("/invoices", fallback);
      }
      throw error;
    }
  }

  private async findByCustomId(entity: string, field: string, value: string): Promise<string | undefined> {
    try {
      const result = await requestJson<{ value?: Array<Record<string, string>> }>(this.api(`/${entity}`), {
        headers: await this.headers(),
        query: { $select: `${entity.replace(/s$/, "")}id`, $filter: `${field} eq '${value}'`, $top: 1 },
      });
      const row = result.value?.[0];
      return row ? Object.values(row).find((item) => typeof item === "string") : undefined;
    } catch {
      return undefined;
    }
  }

  private async create(path: string, payload: Record<string, unknown>): Promise<string> {
    const created = await requestJson<Record<string, string>>(this.api(path), {
      method: "POST",
      headers: await this.headers(),
      body: payload,
    });
    return created.contactid || created.invoiceid || created.annotationid || created.activityid || "created";
  }

  private async patch(path: string, payload: Record<string, unknown>): Promise<void> {
    await requestJson(this.api(path), {
      method: "PATCH",
      headers: { ...(await this.headers()), "If-Match": "*" },
      body: payload,
    });
  }
}
