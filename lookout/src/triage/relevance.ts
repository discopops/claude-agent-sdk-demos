import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";

const MODEL = process.env.LOOKOUT_MODEL ?? "claude-haiku-4-5-20251001";

const RelevanceOut = z.object({
  relevance: z.number().min(0).max(1).describe("0..1 how much THIS user would care about this situation"),
  why: z.string().describe("one line: why this score"),
});

export function llmRelevanceEnabled(): boolean {
  return process.env.LOOKOUT_LLM_RELEVANCE === "1";
}

/**
 * Cheap LLM relevance triage — a sharper personalization gate than keyword
 * overlap. Given the profile and a situation, score 0..1 how much the user
 * would care. Env-gated (LOOKOUT_LLM_RELEVANCE=1) so default cost is unchanged.
 */
export async function llmRelevance(sit: Situation, profile: Profile): Promise<{ score: number; why: string }> {
  let captured: z.infer<typeof RelevanceOut> | null = null;
  const server = createSdkMcpServer({
    name: "rel",
    version: "1.0.0",
    tools: [
      tool("emit_relevance", "Emit the relevance score.", RelevanceOut.shape, async (args) => {
        captured = args as z.infer<typeof RelevanceOut>;
        return { content: [{ type: "text", text: "ok" }] };
      }),
    ],
  });

  const system =
    "You score how relevant a world situation is to a specific user, 0..1. Be strict: 1.0 is a " +
    "direct hit on a stated interest/entity/region/standing question; 0.1 is unrelated. Consider " +
    "second-order relevance (e.g. Fed policy affects the user's energy and semiconductor interests).";
  const user =
    `USER PROFILE:\n` +
    `interests: ${profile.interests.map((i) => i.topic).join("; ")}\n` +
    `regions: ${profile.regions.map((r) => r.name).join(", ")}\n` +
    `entities: ${profile.entities.map((e) => e.key).join(", ")}\n` +
    `standing questions: ${profile.standingQuestions.filter((q) => q.active).map((q) => q.text).join(" | ")}\n\n` +
    `SITUATION: ${sit.title} (entities: ${sit.entityKeys.join(", ")})\n` +
    `Call emit_relevance. Do not reply with prose.`;

  for await (const message of query({
    prompt: user,
    options: {
      systemPrompt: system,
      model: MODEL,
      mcpServers: { rel: server },
      allowedTools: ["mcp__rel__emit_relevance"],
      canUseTool: async (_n, input) => ({ behavior: "allow", updatedInput: input }),
      pathToClaudeCodeExecutable: process.env.LOOKOUT_CLAUDE_BIN ?? "/opt/node22/bin/claude",
      maxTurns: 2,
    },
  })) {
    if (message.type === "result") break;
  }

  if (!captured) throw new Error("relevance triage produced no score");
  const c = captured as z.infer<typeof RelevanceOut>;
  return { score: c.relevance, why: c.why };
}
