import { z } from "zod";

export const workspaceContextSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().positive().safe(),
  currentRound: z.number().int().positive().safe(),
}).strict();

const publicContextSchema = workspaceContextSchema.extend({ goal: z.string().min(1).max(2000) });

export function publicWorkspaceContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed = publicContextSchema.safeParse({ id: value.id, revision: value.revision,
    currentRound: value.currentRound, goal: value.goal });
  return parsed.success ? parsed.data : undefined;
}
