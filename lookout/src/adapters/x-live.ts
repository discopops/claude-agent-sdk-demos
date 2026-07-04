import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Live X provider — connects to X's hosted MCP server (api.x.com/mcp, launched
// 30 Jun 2026) through the Claude Agent SDK, which is itself an MCP client. An
// agent uses X's search/trends tools to gather current discussion for the
// entities we care about, then emits it in Lookout's canonical topic shape.
//
// NOTE: this path is env-guarded and UNTESTED against live X in this
// environment — X requires OAuth (can't complete non-interactively) and is
// pay-per-use. It is wired and ready: set X_MCP_URL + X_MCP_BEARER and it
// engages; any failure degrades to the mock fixtures (see x.adapter.ts).

export interface XTopic {
  topic: string;
  entityKeys: string[];
  geo?: { country?: string };
  mentions: number;
  prevMentions: number;
  sampleTexts: string[];
  rawRef?: string; // provenance pointer, e.g. "snapshot-01.json#topic" for fixtures
}

const XTopicsOut = z.object({
  topics: z.array(
    z.object({
      topic: z.string(),
      entityKeys: z.array(z.string()),
      geoCountry: z.string().optional(),
      mentions: z.number(),
      prevMentions: z.number(),
      sampleTexts: z.array(z.string()),
    }),
  ),
});

const MODEL = process.env.LOOKOUT_MODEL ?? "claude-haiku-4-5-20251001";

export function xLiveConfigured(): boolean {
  return !!(process.env.X_MCP_URL && process.env.X_MCP_BEARER);
}

/**
 * Pull current X discussion for the given entity slugs via the hosted X MCP.
 * Throws if not configured or on any transport error — the caller degrades to mock.
 */
export async function fetchLiveXTopics(entityHints: string[]): Promise<XTopic[]> {
  const url = process.env.X_MCP_URL;
  const bearer = process.env.X_MCP_BEARER;
  if (!url || !bearer) throw new Error("X live not configured (set X_MCP_URL + X_MCP_BEARER)");

  let captured: z.infer<typeof XTopicsOut> | null = null;
  const emit = createSdkMcpServer({
    name: "xout",
    version: "1.0.0",
    tools: [
      tool("emit_x_signals", "Emit the gathered X topics.", XTopicsOut.shape, async (args) => {
        captured = args as z.infer<typeof XTopicsOut>;
        return { content: [{ type: "text", text: "recorded" }] };
      }),
    ],
  });

  const prompt =
    `Using the X tools, find the current top real-time discussion relevant to these topics: ` +
    `${entityHints.join(", ")}. For each distinct topic cluster, gather post volume now vs the ` +
    `prior comparable window and 4-6 representative posts that convey the mood. Then call ` +
    `emit_x_signals with the structured result. Do not reply with prose.`;

  for await (const message of query({
    prompt,
    options: {
      model: MODEL,
      mcpServers: {
        // Hosted streamable-HTTP MCP server (the connector this repo did not
        // previously demonstrate). The SDK is the MCP client.
        x: { type: "http", url, headers: { Authorization: `Bearer ${bearer}` } } as never,
        xout: emit,
      },
      // X read tools + our emit tool. Keep the surface tight.
      allowedTools: ["mcp__xout__emit_x_signals", "mcp__x__search_posts", "mcp__x__get_trends", "mcp__x__search_recent"],
      canUseTool: async (_n, input) => ({ behavior: "allow", updatedInput: input }),
      pathToClaudeCodeExecutable: process.env.LOOKOUT_CLAUDE_BIN ?? "/opt/node22/bin/claude",
      maxTurns: 8,
    },
  })) {
    if (message.type === "result") break;
  }

  if (!captured) throw new Error("X live pass produced no signals");
  return (captured as z.infer<typeof XTopicsOut>).topics.map((t) => ({
    topic: t.topic,
    entityKeys: t.entityKeys,
    geo: t.geoCountry ? { country: t.geoCountry } : undefined,
    mentions: t.mentions,
    prevMentions: t.prevMentions,
    sampleTexts: t.sampleTexts,
  }));
}
