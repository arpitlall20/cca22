import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { SyncEngine } from "../src/sync/engine.js";
import { SyncStore } from "../src/sync/store.js";

describe("sample sync", () => {
  it("pulls fixture students and dry-runs Dynamics writes", async () => {
    const filePath = join(mkdtempSync(join(tmpdir(), "foxbridge-")), "state.json");
    const engine = new SyncEngine(loadConfig(), new SyncStore(filePath));
    const result = await engine.run({ force: true });
    expect(result.mode.swiftfox).toBe("sample");
    expect(result.mode.dynamics).toBe("sample");
    expect(result.counts.student.pulled).toBe(5);
    expect(result.counts.invoice.pulled).toBeGreaterThan(0);
    expect(result.errors).toEqual([]);
    const snapshot = engine.snapshot();
    expect(snapshot.students.map((student) => student.email)).toContain("maya.chen@campus.example.edu");
    expect(snapshot.counts.outstandingCents).toBe(18500);
    expect(snapshot.links.some((link) => link.kind === "student" && link.dryRun)).toBe(true);
  });

  it("skips unchanged students on a second pass", async () => {
    const filePath = join(mkdtempSync(join(tmpdir(), "foxbridge-")), "state.json");
    const engine = new SyncEngine(loadConfig(), new SyncStore(filePath));
    await engine.run({ force: true });
    const second = await engine.run();
    expect(second.counts.student.skipped).toBe(5);
    expect(second.counts.student.upserted).toBe(0);
  });
});
