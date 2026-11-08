# FoxBridge

CCA student and finance sync between **SwiftFox** and **Microsoft Dynamics 365**.

SwiftFox is the system of record for people and money. FoxBridge reads students, invoices, receipts and subscriptions from the SwiftFox External API Gateway, then upserts them into Dataverse (Contacts and Invoices). Until custom Dynamics tables exist, receipts and membership plans are written as notes on the contact.

This repo ships with sample campus data so the console works before API keys are issued.

## What the SwiftFox API covers

Auth is a bearer API key:

```
Authorization: Bearer <key>
```

Base URL: `https://api.swiftfoxcrm.com`  
Swagger: https://api.swiftfoxcrm.com/swagger/index.html  
Policy: https://www.swiftfoxcrm.com/policies/api-documentation

The copy of the spec used to build this bridge is in `docs/openapi/swiftfox-v1.json`.

| Area | Endpoints FoxBridge uses |
| --- | --- |
| People (students) | `GET /api/v1/people`, `GET /api/v1/people/{id}` |
| Invoices | `GET /api/v1/people/{id}/invoices`, `GET /api/v1/invoice/{id}` |
| Receipts | `GET /api/v1/people/{id}/receipts`, `GET /api/v1/receipts`, `GET /api/v1/receipt/{id}` |
| Subscriptions | `GET /api/v1/people/{id}/subscriptions`, `GET /api/v1/subscription/{id}` |
| Webhooks | `POST /api/v1/hook` with `{ eventName, url }` |

SwiftFox finance is invoice-first: invoices are the source of truth, receipts reduce the balance, and subscription arrears are derived from invoices. Amounts in the API are integer minor units (cents).

## Dynamics mapping

| SwiftFox | Dynamics |
| --- | --- |
| Person | `contact` (`firstname`, `lastname`, `emailaddress1`, phones, address, `sfox_personid`) |
| Invoice | `invoice` + `invoicedetail`, customer bound to the contact |
| Receipt | `annotation` on the contact (swap to a custom table later) |
| Subscription | `annotation` on the contact (swap to `sfox_subscription` later) |

Match key: `sfox_personid` when the column exists, otherwise `emailaddress1`.

Optional custom columns to add in Dynamics:

- `sfox_personid` on Contact
- `sfox_invoiceid` on Invoice
- `sfox_receiptid` / `sfox_subscriptionid` if you promote notes to tables

## Run it

```bash
npm install
npm test
npm run dev
```

- Console: http://127.0.0.1:5173
- API: http://127.0.0.1:8787

Copy `.env.example` to `.env` and add:

- `SWIFTFOX_API_KEY` from SwiftFox → Settings → Integrations → API keys. The key needs people and finance scopes.
- Dynamics app registration values: `DYNAMICS_ORG_URL`, `DYNAMICS_TENANT_ID`, `DYNAMICS_CLIENT_ID`, `DYNAMICS_CLIENT_SECRET`.

With those unset, sync uses the sample students and dry-runs Dynamics writes into `data/state.json`.

Point SwiftFox webhooks at `POST /api/webhooks/swiftfox`. If `WEBHOOK_SECRET` is set, send it as `X-Webhook-Secret`.

## Sync behaviour

1. Pull people from SwiftFox (or sample fixtures).
2. For each person, pull invoices, receipts and subscriptions.
3. Normalise to canonical records (see `src/mapping/normalize.ts`).
4. Skip unchanged records unless `force` is set.
5. Upsert Contact, then Invoice. Receipts and subscriptions follow as notes.
6. Record links and an activity log.

`POST /api/sync` with `{ "force": true, "studentId": "1001" }` resyncs one student.
