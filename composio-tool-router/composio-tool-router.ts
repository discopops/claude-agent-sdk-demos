/**
 * Composio Tool Router + Claude Agent SDK Demo
 *
 * This demo connects the Claude Agent SDK to Composio's Tool Router via MCP.
 * The Tool Router dynamically discovers, authenticates, and routes tool calls
 * across 1000+ app integrations (GitHub, Gmail, Slack, etc.) through a single
 * MCP endpoint.
 *
 * Run with: npx tsx composio-tool-router.ts
 *
 * Required environment variables (see .env.example):
 *   COMPOSIO_API_KEY  - Your Composio API key (https://app.composio.dev)
 *   COMPOSIO_USER_ID  - A stable user identifier for the session
 *   ANTHROPIC_API_KEY - Your Anthropic API key (used by the Claude Agent SDK)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { Composio } from '@composio/core';
import * as dotenv from 'dotenv';

dotenv.config();

// ─── Configuration ────────────────────────────────────────────────────────────

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_USER_ID = process.env.COMPOSIO_USER_ID ?? 'default-user';

// The toolkits to make available to the agent.
// The Tool Router will dynamically load only the tools relevant to each task.
// See https://app.composio.dev/apps for the full list of available toolkits.
const TOOLKITS = ['github', 'gmail', 'googlecalendar'];

// The prompt sent to Claude. Update this to match what you want the agent to do.
const PROMPT = process.argv[2] ?? 'What tools do you have available?';

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!COMPOSIO_API_KEY) {
    console.error(
      'Error: COMPOSIO_API_KEY is not set. Copy .env.example to .env and fill in your keys.'
    );
    process.exit(1);
  }

  console.log(`User ID : ${COMPOSIO_USER_ID}`);
  console.log(`Toolkits: ${TOOLKITS.join(', ')}`);
  console.log(`Prompt  : ${PROMPT}\n`);

  // 1. Initialise the Composio SDK
  const composio = new Composio({ apiKey: COMPOSIO_API_KEY });

  // 2. Create (or resume) a Tool Router session for this user.
  //    The session returns:
  //      session.mcp.url     – the HTTP/SSE MCP endpoint
  //      session.mcp.type    – transport type ('http' or 'sse')
  //      session.mcp.headers – auth headers to pass with every request
  //      session.experimental?.assistivePrompt – optional system-prompt hint
  console.log('Creating Composio Tool Router session…');
  const session = await composio.create(COMPOSIO_USER_ID, {
    toolkits: TOOLKITS,
    manageConnections: true,
    experimental: { assistivePrompt: {} },
  });

  const { url, type, headers } = session.mcp;
  console.log(`Session ID : ${session.sessionId}`);
  console.log(`MCP URL    : ${url}`);
  console.log(`MCP type   : ${type}\n`);

  // 3. Build the system prompt.
  //    Composio can generate an assistive prompt that tells Claude how to
  //    interact with the Tool Router (auth flows, tool discovery, etc.).
  const systemPrompt = [
    'You are a helpful assistant with access to Composio tools.',
    session.experimental?.assistivePrompt ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // 4. Run the Claude Agent SDK query, pointing it at the Composio MCP server.
  //    allowedTools uses a wildcard so Claude can call any tool the router
  //    surfaces – no need to enumerate them upfront.
  console.log('Starting Claude agent…\n');

  for await (const message of query({
    prompt: PROMPT,
    options: {
      model: 'sonnet',
      systemPrompt,
      mcpServers: {
        composio: {
          type,
          url,
          ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
        },
      },
      allowedTools: ['mcp__composio__*'],
    },
  })) {
    // Log MCP server connection status on init
    if (message.type === 'system' && message.subtype === 'init') {
      const servers = (message as any).mcp_servers ?? [];
      for (const server of servers) {
        const status = server.status === 'connected' ? '✓' : '✗';
        console.log(`[MCP] ${status} ${server.name} (${server.status})`);
      }
      if (servers.length > 0) console.log('');
    }

    // Log MCP tool calls
    if (message.type === 'assistant') {
      for (const block of (message as any).message?.content ?? []) {
        if (block.type === 'tool_use' && block.name?.startsWith('mcp__')) {
          console.log(`[Tool] ${block.name}`);
        }
      }
    }

    // Print the final result
    if (message.type === 'result' && message.subtype === 'success') {
      console.log('\n─── Result ───────────────────────────────────────────────');
      console.log((message as any).result);
    }

    if (message.type === 'result' && message.subtype === 'error_during_execution') {
      console.error('\nAgent encountered an error during execution.');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
