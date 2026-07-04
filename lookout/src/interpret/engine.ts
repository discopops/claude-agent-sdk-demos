import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Situation } from "../types.ts";
import type { Profile } from "../profile/profile.ts";
import { Interpretation } from "./schema.ts";
import { calibrate } from "./calibrate.ts";

const SYSTEM = readFileSync(resolve(import.meta.dir, "prompts/analyst.txt"), "utf8");
const MODEL = process.env.LOOKOUT_MODEL ?? "claude-haiku-4-5-20251001";

/** Render a situation's signals as the analyst's briefing input. Exported for the deep pass. */
export function renderSituation(sit: Situation, profile: Profile, prev?: Interpretation): string {
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
    lines.push("If reality has moved against that read, set change/wasWrong and own it in whatsHappening.");
  }
  return lines.join("\n");
}

/**
 * Core forced-structured-output call: given a system prompt and user content,
 * make the agent emit exactly one Interpretation via an in-process MCP tool.
 * Shared by the quick single-pass engine and the deep multi-agent synthesizer.
 * Returns the validated (uncalibrated) Interpretation.
 */
export async function emitInterpretation(system: string, user: string): Promise<Interpretation> {
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
    prompt: `${user}\n\nCall emit_interpretation with your analytic read. Do not reply with prose.`,
    options: {
      systemPrompt: system,
      model: MODEL,
      mcpServers: { lookout: server },
      allowedTools: ["mcp__lookout__emit_interpretation"],
      // Auto-approve our single structured-output tool. We avoid bypassPermissions
      // because Claude Code refuses --dangerously-skip-permissions when running as root.
      canUseTool: async (_name, input) => ({ behavior: "allow", updatedInput: input }),
      pathToClaudeCodeExecutable: process.env.LOOKOUT_CLAUDE_BIN ?? "/opt/node22/bin/claude",
      maxTurns: 3,
    },
  })) {
    if (message.type === "result") break;
  }

  if (!captured) throw new Error("agent did not call emit_interpretation");
  return Interpretation.parse(captured);
}

/** Quick single-pass interpretation for one situation (T1). */
export async function interpret(sit: Situation, profile: Profile, prev?: Interpretation): Promise<Interpretation> {
  const interp = await emitInterpretation(SYSTEM, renderSituation(sit, profile, prev));
  interp.depth = "quick";
  return calibrate(interp, sit.signals);
}

/** Free-form agent pass returning plain text (used for the deep pass's angle analysts). */
export async function runAnalyst(system: string, user: string): Promise<string> {
  let text = "";
  for await (const message of query({
    prompt: user,
    options: {
      systemPrompt: system,
      model: MODEL,
      canUseTool: async (_n, input) => ({ behavior: "allow", updatedInput: input }),
      pathToClaudeCodeExecutable: process.env.LOOKOUT_CLAUDE_BIN ?? "/opt/node22/bin/claude",
      maxTurns: 1,
    },
  })) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") text += block.text;
      }
    }
    if (message.type === "result") break;
  }
  return text.trim();
}
