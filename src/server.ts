import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { loadEnv } from "./loadEnv.js";
import { createHandler } from "./routes/api.js";
import { SyncEngine } from "./sync/engine.js";

loadEnv();

const config = loadConfig();
const engine = new SyncEngine(config);

if (engine.snapshot().students.length === 0) {
  await engine.run();
}

const server = createServer(createHandler(config, engine));
server.listen(config.port, "127.0.0.1", () => {
  console.log(`FoxBridge listening on http://127.0.0.1:${config.port}`);
});
