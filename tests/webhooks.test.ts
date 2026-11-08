import { describe, expect, it } from "vitest";
import { planWebhook } from "../src/webhooks/handler.js";

describe("webhook planner", () => {
  it("syncs a single student when a person event includes an id", () => {
    expect(planWebhook({ eventName: "New Person", payload: { id: 1001 } })).toMatchObject({
      action: "sync-student",
      studentId: "1001",
    });
  });

  it("syncs finance events against the owner", () => {
    expect(planWebhook({ event: "invoice.paid", data: { ownerId: 1002 } })).toMatchObject({
      action: "sync-student",
      studentId: "1002",
    });
  });

  it("ignores unrelated events", () => {
    expect(planWebhook({ eventName: "task.completed" }).action).toBe("ignore");
  });
});
