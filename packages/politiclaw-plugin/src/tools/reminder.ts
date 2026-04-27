import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { findOpenByTarget, attachGeneratedReminder } from "../domain/actionMoments/index.js";
import {
  createReminder,
  type CreateReminderResult,
} from "../domain/outreach/reminder.js";
import { getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

// Discriminated union on `kind`. TypeBox narrows correctly at the type
// level when a caller checks `parsed.data.anchor.kind === "bill"`, and
// Value.Check (via safeParse) accepts only the variant whose literal
// matches at runtime — same selection semantics Zod's
// .discriminatedUnion("kind", [...]) used to provide.
const ReminderAnchorParams = Type.Union([
  Type.Object({
    kind: Type.Literal("bill"),
    billId: Type.String({
      minLength: 1,
      description: "Canonical bill id ('119-hr-1234').",
    }),
  }),
  Type.Object({
    kind: Type.Literal("event"),
    eventId: Type.String({
      minLength: 1,
      description: "Canonical event id from politiclaw_check_upcoming_votes.",
    }),
  }),
  Type.Object({
    kind: Type.Literal("election"),
    electionDate: Type.String({
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "ISO election date (YYYY-MM-DD).",
    }),
  }),
]);

const CreateReminderParams = Type.Object({
  title: Type.String({
    minLength: 1,
    description: "Short user-facing label for the reminder.",
  }),
  deadline: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Optional ISO-8601 date or datetime. When set, the monitoring crons surface the reminder as it comes due.",
    }),
  ),
  anchor: ReminderAnchorParams,
  extraSteps: Type.Optional(
    Type.Array(Type.String({ minLength: 1 }), {
      description: "Optional user-supplied checklist items appended verbatim in order.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export function renderCreateReminderOutput(result: CreateReminderResult): string {
  if (result.status === "anchor_not_found") {
    return `Cannot create reminder: ${result.reason}`;
  }
  const { reminder } = result;
  const header = `Reminder #${reminder.id} — ${reminder.title}${
    reminder.deadline ? ` (due ${reminder.deadline})` : ""
  }`;
  const stepLines = reminder.steps.map((step) => `  • ${step}`);
  return [header, "", ...stepLines].join("\n");
}

export const createReminderTool: AnyAgentTool = {
  name: "politiclaw_create_reminder",
  label: "Create a reminder anchored to a bill, event, or election",
  description:
    "Persist a reminder with a slot-filled checklist anchored to a bill, upcoming " +
    "committee event, or election date. Reminders do not self-notify; the existing " +
    "monitoring crons re-read them and surface ones whose deadline is within 48 hours. " +
    "Use this when the user says 'remind me' rather than 'draft' — letters/call scripts " +
    "are separate flows.",
  parameters: CreateReminderParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(CreateReminderParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const result = createReminder(db, {
      title: parsed.data.title,
      deadline: parsed.data.deadline,
      anchor: parsed.data.anchor,
      extraSteps: parsed.data.extraSteps,
    });

    if (result.status === "ok") {
      const billId = parsed.data.anchor.kind === "bill" ? parsed.data.anchor.billId : null;
      const matching = findOpenByTarget(db, "tracked_event_scheduled", billId, null, null);
      for (const pkg of matching) {
        attachGeneratedReminder(db, pkg.id, result.reminder.id);
      }
    }

    return textResult(renderCreateReminderOutput(result), result);
  },
};

export const reminderTools: AnyAgentTool[] = [createReminderTool];
