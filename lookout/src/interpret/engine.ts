import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";
import { Interpretation } from "./schema.ts";
import { calibrate } from "./calibrate.ts";

const SYSTEM = readFileSync(resolve(import.meta.dir, "prompts/analyst.txt"), "utf8");
const MODEL = process.env.LOOKOUT_MODEL ?? "claude-haiku-4-5-20251001";

function renderSituation(sit: Situation, profile: Profile, prev?: Interpretation): string {
  const lines: string[] = [];
  lines.push(`SITUATION: ${sit.title}  (entities: ${sit.entityKeys.join(", ")})`);
  lines.push(`Sources active: ${sit.activeSources.join(", ")}`);
  lines.push("");
  lines.push("SIGNALS:");
  for (const s of sit.signals) {
    const d = s.delta ? ` (Δ ${(s.delta.changePct * 100).toFixed(0)}% this window)` : "";
    const conv = s.conviction != null ? ` [conviction ${s.conviction.toFixed(2)}]` : "";
    lines.push(
      `- [${s.sourceId}/${s.dimension}] ${s.metric.name}=${s.metric.value}` +
        `${s.metric.unit === "prob" ? " (implied prob)" : " " + s.metric.unit}${d}${conv}`,
    );
    if (s.sourceId === "kalshi") lines.push(`    market ref: ${s.rawRef}`);
    if (s.text) lines.push(`    ${s.text.replace(/\n/g, "\n    ")}`);
  }
  lines.push("");
  lines.push(`USER INTERESTS: ${profile.interests.map((i) => i.topic).join("; ")}`);
  if (prev) {
    lines.push("");
    lines.push(`YOUR PREVIOUS READ was: "${prev.whatsHappening}" (confidence ${prev.confidence}).`);
    lines.push("If reality has moved against that read, say so plainly in whatsHappening — own the change.");
  }
  lines.push("");
  lines.push("Call emit_interpretation with your analytic read. Do not reply with prose.");
  return lines.join("\n");
}

/**
 * Run the interpretation engine for one situation via the Claude Agent SDK.
 * Structured output is forced through an in-process MCP tool (emit_interpretation)
 * whose Zod schema is the Interpretation contract — the agent must call it, and
 * we capture + calibrate the validated result.
 */
export async function interpret(sit: Situation, profile: Profile, prev?: Interpretation): Promise<Interpretation> {
  let captured: Interpretation | null = null;

  const server = createSdkMcpServer({
    name: "lookout",
    version: "1.0.0",
    tools: [
      tool(
        "emit_interpretation",
        "Emit your analytic read of this situation. Call exactly once.",
        Interpretation.shape,
        async (args) => {
          captured = args as Interpretation;
          return { content: [{ type: "text", text: "interpretation recorded" }] };
        },
      ),
    ],
  });

  for await (const message of query({
    prompt: renderSituation(sit, profile, prev),
    options: {
      systemPrompt: SYSTEM,
      model: MODEL,
      mcpServers: { lookout: server },
      allowedTools: ["mcp__lookout__emit_interpretation"],
      // Auto-approve our single structured-output tool. We avoid
      // bypassPermissions because Claude Code refuses --dangerously-skip-permissions
      // when running as root.
      canUseTool: async (_name, input) => ({ behavior: "allow", updatedInput: input }),
      pathToClaudeCodeExecutable: process.env.LOOKOUT_CLAUDE_BIN ?? "/opt/node22/bin/claude",
      maxTurns: 3,
    },
  })) {
    if (message.type === "result") break;
  }

  if (!captured) throw new Error("agent did not call emit_interpretation");
  return calibrate(Interpretation.parse(captured), sit.signals);
}
