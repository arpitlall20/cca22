import { useEffect, useMemo, useState } from "react";
import { fetchMapping, fetchStatus, runSync, type FieldMap, type StatusPayload } from "./api";

const nav = [
  ["overview", "Overview"],
  ["students", "Students"],
  ["finance", "Finance"],
  ["mapping", "Field map"],
  ["activity", "Activity"],
] as const;

type Page = (typeof nav)[number][0];

function money(cents: number, currency = "AUD") {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(cents / 100);
}

function studentName(status: StatusPayload, id?: string) {
  return status.students.find((student) => student.swiftfoxId === id)?.fullName ?? id ?? "—";
}

export function App() {
  const [page, setPage] = useState<Page>("overview");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [fields, setFields] = useState<FieldMap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [financeTab, setFinanceTab] = useState<"invoices" | "receipts" | "subscriptions">("invoices");
  const [domain, setDomain] = useState("student");

  async function refresh() {
    const [nextStatus, mapping] = await Promise.all([fetchStatus(), fetchMapping()]);
    setStatus(nextStatus);
    setFields(mapping.fields);
  }

  useEffect(() => {
    refresh().catch((err: Error) => setError(err.message));
  }, []);

  const filteredMaps = useMemo(
    () => fields.filter((field) => field.domain === domain),
    [fields, domain],
  );

  async function syncNow() {
    setBusy(true);
    setError(null);
    try {
      await runSync(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <div className="main">{error ? <p className="error">{error}</p> : <p>Opening the ledger…</p>}</div>;
  }

  return (
    <div className="app">
      <aside className="rail">
        <div className="mark">Fox<span>Bridge</span></div>
        <p className="tagline">SwiftFox student finance into Dynamics 365</p>
        <nav className="nav">
          {nav.map(([id, label]) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}>
              {label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="top">
          <div>
            <h1>
              {page === "overview" && "The books, in one place"}
              {page === "students" && "Students"}
              {page === "finance" && "Invoices, receipts, plans"}
              {page === "mapping" && "How the fields line up"}
              {page === "activity" && "What the bridge did"}
            </h1>
            <p className="lede">
              SwiftFox is the system of record for people and money. FoxBridge pulls those records and
              upserts them into Microsoft Dynamics, invoice-first.
            </p>
            <div className="pills">
              <span className={`pill ${status.connections.swiftfox.mode}`}>
                SwiftFox {status.connections.swiftfox.mode}
              </span>
              <span className={`pill ${status.connections.dynamics.mode}`}>
                Dynamics {status.connections.dynamics.mode}
              </span>
              {status.lastRun && (
                <span className="pill">Last sync {new Date(status.lastRun.finishedAt).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="actions">
            <button className="ghost" onClick={() => refresh()}>Refresh</button>
            <button className="primary" disabled={busy} onClick={syncNow}>
              {busy ? "Syncing…" : "Run sync"}
            </button>
          </div>
        </header>
        {error && <p className="error">{error}</p>}

        {page === "overview" && (
          <>
            <section className="kpis">
              <article className="card">
                <div className="kpi-label">Students</div>
                <div className="kpi-value">{status.counts.students}</div>
              </article>
              <article className="card">
                <div className="kpi-label">Open invoices</div>
                <div className="kpi-value">
                  {status.invoices.filter((invoice) => invoice.outstandingCents > 0).length}
                </div>
              </article>
              <article className="card">
                <div className="kpi-label">Outstanding</div>
                <div className="kpi-value">{status.formattedOutstanding}</div>
              </article>
              <article className="card">
                <div className="kpi-label">Receipts posted</div>
                <div className="kpi-value">{status.counts.receipts}</div>
              </article>
            </section>
            <div className="grid-2">
              <section className="card">
                <h2>Sync path</h2>
                <p className="muted">
                  People from <span className="mono">GET /api/v1/people</span>, invoices from
                  {" "}<span className="mono">/people/{"{id}"}/invoices</span>, receipts and subscriptions
                  on the same contact. Dynamics writes Contact + Invoice, with receipts and plans stored
                  as notes until custom tables exist.
                </p>
                {status.lastRun && (
                  <p className="muted">
                    Last run pulled {status.lastRun.counts.student.pulled} students,{" "}
                    {status.lastRun.counts.invoice.pulled} invoices, {status.lastRun.counts.receipt.pulled} receipts.
                    Mode: SwiftFox {status.lastRun.mode.swiftfox}, Dynamics {status.lastRun.mode.dynamics}.
                  </p>
                )}
              </section>
              <section className="card">
                <h2>Recent activity</h2>
                <ul className="activity">
                  {status.activity.slice(0, 6).map((item) => (
                    <li key={item.id}>
                      <div>{item.message}</div>
                      <div className="muted">{new Date(item.at).toLocaleString()} · {item.action}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}

        {page === "students" && (
          <section className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SwiftFox</th>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Campus</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {status.students.map((student) => {
                  const balance = status.invoices
                    .filter((invoice) => invoice.studentSwiftfoxId === student.swiftfoxId)
                    .reduce((sum, invoice) => sum + invoice.outstandingCents, 0);
                  return (
                    <tr key={student.swiftfoxId}>
                      <td className="mono">{student.swiftfoxId}</td>
                      <td>{student.fullName}</td>
                      <td>{student.email}</td>
                      <td>{student.addresses[0] ? `${student.addresses[0].locality} ${student.addresses[0].state}` : "—"}</td>
                      <td>{money(balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {page === "finance" && (
          <section className="panel">
            <div className="filters">
              {(["invoices", "receipts", "subscriptions"] as const).map((tab) => (
                <button key={tab} className={financeTab === tab ? "active" : ""} onClick={() => setFinanceTab(tab)}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="card table-wrap">
              {financeTab === "invoices" && (
                <table>
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th>Due</th>
                      <th>Total</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.invoices.map((invoice) => (
                      <tr key={invoice.swiftfoxId}>
                        <td className="mono">{invoice.number}</td>
                        <td>{studentName(status, invoice.studentSwiftfoxId)}</td>
                        <td><span className={`status ${invoice.status}`}>{invoice.status}</span></td>
                        <td>{invoice.date}</td>
                        <td>{invoice.due}</td>
                        <td>{money(invoice.totalCents, invoice.currency)}</td>
                        <td>{money(invoice.outstandingCents, invoice.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {financeTab === "receipts" && (
                <table>
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Student</th>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.receipts.map((receipt) => (
                      <tr key={receipt.swiftfoxId}>
                        <td className="mono">{receipt.receiptNo}</td>
                        <td>{studentName(status, receipt.studentSwiftfoxId)}</td>
                        <td>{receipt.effectiveDate}</td>
                        <td>{receipt.method}</td>
                        <td>{money(receipt.amountCents, receipt.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {financeTab === "subscriptions" && (
                <table>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Paid to</th>
                      <th>Fee</th>
                      <th>Arrears</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.subscriptions.map((subscription) => (
                      <tr key={subscription.swiftfoxId}>
                        <td>{subscription.planName}</td>
                        <td>{studentName(status, subscription.studentSwiftfoxId)}</td>
                        <td><span className={`status ${subscription.status}`}>{subscription.status}</span></td>
                        <td>{subscription.paidTo ?? "—"}</td>
                        <td>{money(subscription.feeCents ?? 0, subscription.currency)}</td>
                        <td>{money(subscription.arrearsCents ?? 0, subscription.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {page === "mapping" && (
          <section className="card">
            <div className="filters">
              {["student", "invoice", "receipt", "subscription"].map((item) => (
                <button key={item} className={domain === item ? "active" : ""} onClick={() => setDomain(item)}>
                  {item}
                </button>
              ))}
            </div>
            {filteredMaps.map((field) => (
              <div className="map-row" key={`${field.domain}-${field.swiftfox}-${field.dynamics}`}>
                <div>
                  <div className="map-key">{field.swiftfox}</div>
                  <div className="notes">{field.swiftfoxPath}</div>
                </div>
                <div className="map-arrow">→</div>
                <div>
                  <div className="map-key">{field.dynamics}</div>
                  <div className="notes">{field.dynamicsEntity}{field.transform ? ` · ${field.transform}` : ""}{field.notes ? ` · ${field.notes}` : ""}</div>
                </div>
              </div>
            ))}
          </section>
        )}

        {page === "activity" && (
          <section className="card">
            <ul className="activity">
              {status.activity.map((item) => (
                <li key={item.id}>
                  <div>{item.ok ? item.message : `Failed: ${item.message}`}</div>
                  <div className="muted">{new Date(item.at).toLocaleString()} · {item.kind} · {item.action}</div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
