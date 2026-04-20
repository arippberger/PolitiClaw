import { z } from "zod";

export const PreferencesSchema = z.object({
  address: z.string().min(1, "address is required"),
  zip: z.string().trim().optional(),
  state: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .refine((s) => s === "" || /^[A-Z]{2}$/.test(s), "state must be a 2-letter code")
    .optional(),
  district: z.string().trim().optional(),
});

export type Preferences = z.infer<typeof PreferencesSchema>;

export type PreferencesRow = Preferences & { updatedAt: number };

export const StanceSignalSchema = z
  .object({
    issue: z.string().trim().min(1).optional(),
    billId: z.string().trim().min(1).optional(),
    direction: z.enum(["agree", "disagree", "skip"]),
    weight: z.number().positive().default(1.0),
    source: z.enum(["onboarding", "monitoring", "dashboard"]),
  })
  .refine((v) => v.issue !== undefined || v.billId !== undefined, {
    message: "one of issue or billId is required",
  });

export type StanceSignal = z.infer<typeof StanceSignalSchema>;

/**
 * User-declared position on a policy issue. Drives bill alignment scoring
 * and representative scoring. Distinct from {@link StanceSignal}, which is a
 * single interaction event.
 */
export const IssueStanceSchema = z.object({
  issue: z
    .string()
    .trim()
    .min(1, "issue is required")
    .transform((value) => value.toLowerCase().replace(/\s+/g, "-")),
  stance: z.enum(["support", "oppose", "neutral"]),
  weight: z.number().int().min(1).max(5).default(3),
});

export type IssueStance = z.infer<typeof IssueStanceSchema>;

export type IssueStanceRow = IssueStance & { updatedAt: number };
