import { createReadStream } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connectionStatus, type AppConfig } from "../config.js";
import { fieldMaps } from "../mapping/catalog.js";
import { formatMoney } from "../money.js";
import { SyncEngine } from "../sync/engine.js";
import { planWebhook, type IncomingWebhook } from "../webhooks/handler.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...headers,
  });
  res.end(payload);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

export function createHandler(config: AppConfig, engine = new SyncEngine(config)) {
  const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    const path = url.pathname;
    const method = req.method ?? "GET";

    try {
      if (path === "/api/health") {
        return send(res, 200, { ok: true, service: "foxbridge" });
      }

      if (path === "/api/status" && method === "GET") {
        const snapshot = engine.snapshot();
        return send(res, 200, {
          ...snapshot,
          formattedOutstanding: formatMoney(snapshot.counts.outstandingCents),
        });
      }

      if (path === "/api/students" && method === "GET") {
        return send(res, 200, { items: engine.snapshot().students });
      }
      if (path === "/api/invoices" && method === "GET") {
        return send(res, 200, { items: engine.snapshot().invoices });
      }
      if (path === "/api/receipts" && method === "GET") {
        return send(res, 200, { items: engine.snapshot().receipts });
      }
      if (path === "/api/subscriptions" && method === "GET") {
        return send(res, 200, { items: engine.snapshot().subscriptions });
      }
      if (path === "/api/activity" && method === "GET") {
        return send(res, 200, { items: engine.snapshot().activity });
      }
      if (path === "/api/mapping" && method === "GET") {
        return send(res, 200, {
          systemOfRecord: "SwiftFox",
          destination: "Microsoft Dynamics 365 / Dataverse",
          direction: "swiftfox-to-dynamics",
          connections: connectionStatus(config),
          fields: fieldMaps,
        });
      }

      if (path === "/api/sync" && method === "POST") {
        const body = await readJson<{ force?: boolean; studentId?: string }>(req);
        const result = await engine.run({ force: body.force, studentId: body.studentId });
        return send(res, 200, result);
      }

      if (path === "/api/webhooks/swiftfox" && method === "POST") {
        if (config.webhookSecret) {
          const provided = String(req.headers["x-webhook-secret"] ?? "");
          if (provided !== config.webhookSecret) {
            return send(res, 401, { error: "Invalid webhook secret" });
          }
        }
        const payload = await readJson<IncomingWebhook>(req);
        const plan = planWebhook(payload);
        if (plan.action === "ignore") {
          return send(res, 202, { accepted: true, plan });
        }
        const result = await engine.run({
          force: true,
          studentId: plan.action === "sync-student" ? plan.studentId : undefined,
        });
        return send(res, 202, { accepted: true, plan, result });
      }

      if (path.startsWith("/api/")) {
        return send(res, 404, { error: `No route for ${method} ${path}` });
      }

      const relative = path === "/" ? "/index.html" : path;
      const filePath = join(publicDir, relative);
      if (!filePath.startsWith(publicDir)) return send(res, 403, "Forbidden");
      const type = MIME[extname(filePath)] ?? "application/octet-stream";
      const stream = createReadStream(filePath);
      stream.on("open", () => {
        res.writeHead(200, { "Content-Type": type });
        stream.pipe(res);
      });
      stream.on("error", () => {
        const fallback = createReadStream(join(publicDir, "index.html"));
        fallback.on("open", () => {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          fallback.pipe(res);
        });
        fallback.on("error", () => send(res, 404, "Not found"));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      send(res, 500, { error: message });
    }
  };
}
