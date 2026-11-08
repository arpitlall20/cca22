import { asArray, requestJson } from "../http.js";
import type { AppConfig } from "../config.js";
import type {
  Paginated,
  SwiftFoxInvoice,
  SwiftFoxInvoiceOverview,
  SwiftFoxPerson,
  SwiftFoxReceipt,
  SwiftFoxSubscription,
} from "./types.js";

export class SwiftFoxClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  static fromConfig(config: AppConfig): SwiftFoxClient {
    return new SwiftFoxClient(config.swiftfoxBaseUrl, config.swiftfoxApiKey);
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  me() {
    return requestJson<{ id?: string; name?: string; t?: string; sub?: string }>(this.url("/api/v1/me"), {
      headers: this.headers(),
    });
  }

  version() {
    return requestJson<string>(this.url("/api/v1/version"), { headers: this.headers() });
  }

  async listPeople(): Promise<SwiftFoxPerson[]> {
    const payload = await requestJson<unknown>(this.url("/api/v1/people"), {
      headers: this.headers(),
      query: { pageNo: 1, pageSize: 200 },
    });
    return asArray<SwiftFoxPerson>(payload);
  }

  getPerson(id: string | number) {
    return requestJson<SwiftFoxPerson>(this.url(`/api/v1/people/${id}`), { headers: this.headers() });
  }

  listPersonInvoices(id: string | number, page = 1, pageSize = 100) {
    return requestJson<Paginated<SwiftFoxInvoiceOverview>>(this.url(`/api/v1/people/${id}/invoices`), {
      headers: this.headers(),
      query: { page, pageSize, asc: false, column: "date" },
    });
  }

  getInvoice(id: string | number) {
    return requestJson<SwiftFoxInvoice>(this.url(`/api/v1/invoice/${id}`), { headers: this.headers() });
  }

  listPersonReceipts(id: string | number, page = 1, pageSize = 100) {
    return requestJson<Paginated<SwiftFoxReceipt>>(this.url(`/api/v1/people/${id}/receipts`), {
      headers: this.headers(),
      query: { page, pageSize, asc: false, column: "effectiveDate" },
    });
  }

  listReceipts(from: string, to?: string, pageNo = 1, pageSize = 100) {
    return requestJson<Paginated<SwiftFoxReceipt>>(this.url("/api/v1/receipts"), {
      headers: this.headers(),
      query: { from, to, pageNo, pageSize, column: "effectiveDate", asc: false },
    });
  }

  getReceipt(id: string | number) {
    return requestJson<SwiftFoxReceipt>(this.url(`/api/v1/receipt/${id}`), { headers: this.headers() });
  }

  listPersonSubscriptions(id: string | number) {
    return requestJson<Paginated<SwiftFoxSubscription>>(this.url(`/api/v1/people/${id}/subscriptions`), {
      headers: this.headers(),
    });
  }

  getSubscription(id: string | number) {
    return requestJson<SwiftFoxSubscription>(this.url(`/api/v1/subscription/${id}`), {
      headers: this.headers(),
    });
  }

  subscribeWebhook(eventName: string, url: string) {
    return requestJson<unknown>(this.url("/api/v1/hook"), {
      method: "POST",
      headers: this.headers(),
      body: { eventName, url },
    });
  }
}
