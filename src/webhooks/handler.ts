export type IncomingWebhook = {
  eventName?: string;
  event?: string;
  type?: string;
  id?: string | number;
  recordId?: string | number;
  personId?: string | number;
  ownerId?: string | number;
  payload?: Record<string, unknown>;
  data?: Record<string, unknown>;
};

export type WebhookPlan = {
  action: "sync-student" | "sync-all" | "ignore";
  studentId?: string;
  eventName: string;
  reason: string;
};

const PERSON_EVENTS = [
  "new person",
  "person created",
  "person updated",
  "updated contact detail",
  "removed contact detail",
  "updated custom field",
  "updated category type on a person",
  "new email added",
  "updated email preferences",
];

const FINANCE_EVENTS = [
  "receipt",
  "invoice",
  "subscription",
  "payment",
];

function nestedId(source: Record<string, unknown> | undefined): string | undefined {
  if (!source) return undefined;
  for (const key of ["id", "personId", "ownerId", "recordId", "contactId"]) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value)) return String(value);
  }
  const person = source.person as Record<string, unknown> | undefined;
  if (person?.id !== undefined) return String(person.id);
  const owner = source.owner as Record<string, unknown> | undefined;
  if (owner?.id !== undefined) return String(owner.id);
  return undefined;
}

export function planWebhook(input: IncomingWebhook): WebhookPlan {
  const eventName = String(input.eventName ?? input.event ?? input.type ?? "unknown").trim();
  const lowered = eventName.toLowerCase();
  const studentId =
    nestedId(input as unknown as Record<string, unknown>) ??
    nestedId(input.payload) ??
    nestedId(input.data);

  if (PERSON_EVENTS.some((name) => lowered.includes(name)) || lowered.includes("person")) {
    return {
      action: studentId ? "sync-student" : "sync-all",
      studentId,
      eventName,
      reason: "Person record changed in SwiftFox",
    };
  }

  if (FINANCE_EVENTS.some((name) => lowered.includes(name))) {
    return {
      action: studentId ? "sync-student" : "sync-all",
      studentId,
      eventName,
      reason: "Financial record changed in SwiftFox",
    };
  }

  if (studentId) {
    return {
      action: "sync-student",
      studentId,
      eventName,
      reason: "Webhook included a record id",
    };
  }

  return {
    action: "ignore",
    eventName,
    reason: "Event is not a student or finance change",
  };
}
