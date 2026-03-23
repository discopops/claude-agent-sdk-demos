import express from 'express';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'path';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const AGENT_DIR = path.join(__dirname, 'agent');

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'iOS Claude Integration Server is running' });
});

/**
 * POST /command
 * Send a natural language command to control your iPhone.
 * Body: { "command": "Turn on airplane mode" }
 * Response: { "result": "..." }
 */
app.post('/command', async (req, res) => {
  const { command } = req.body as { command?: string };

  if (!command?.trim()) {
    return res.status(400).json({ error: 'command is required' });
  }

  console.log(`\nReceived command: ${command}`);
  const results: string[] = [];

  try {
    const q = query({
      prompt: command,
      options: {
        maxTurns: 30,
        cwd: AGENT_DIR,
        model: 'claude-sonnet-4-6',
        allowedTools: ['Bash', 'Read', 'Write', 'TodoWrite'],
      },
    });

    for await (const message of q) {
      if (message.type === 'assistant' && message.message) {
        const textContent = message.message.content.find((c: any) => c.type === 'text');
        if (textContent && 'text' in textContent) {
          console.log('Claude:', textContent.text);
          results.push(textContent.text);
        }
      }
    }

    res.json({ result: results.join('\n') });
  } catch (err) {
    console.error('Error processing command:', err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * POST /command/stream
 * Same as /command but streams the response as Server-Sent Events.
 * Useful for long-running commands or real-time feedback.
 */
app.post('/command/stream', async (req, res) => {
  const { command } = req.body as { command?: string };

  if (!command?.trim()) {
    return res.status(400).json({ error: 'command is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const q = query({
      prompt: command,
      options: {
        maxTurns: 30,
        cwd: AGENT_DIR,
        model: 'claude-sonnet-4-6',
        allowedTools: ['Bash', 'Read', 'Write', 'TodoWrite'],
      },
    });

    for await (const message of q) {
      if (message.type === 'assistant' && message.message) {
        const textContent = message.message.content.find((c: any) => c.type === 'text');
        if (textContent && 'text' in textContent) {
          send({ type: 'text', content: textContent.text });
        }
      }
    }

    send({ type: 'done' });
    res.end();
  } catch (err) {
    send({ type: 'error', message: String(err) });
    res.end();
  }
});

app.listen(PORT, () => {
  console.log('\niOS Claude Integration Server');
  console.log('==============================');
  console.log(`Listening at http://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log(`  GET  /health          - Server health check`);
  console.log(`  POST /command         - Send a command (returns JSON)`);
  console.log(`  POST /command/stream  - Send a command (returns SSE stream)`);
  console.log('\nFrom your iPhone Shortcut, POST to:');
  console.log(`  http://<your-mac-ip>:${PORT}/command`);
  console.log('  Body: { "command": "<natural language command>" }\n');
});
