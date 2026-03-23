# iOS Claude Integration

> **Note**: This is a demo application by Anthropic for local development only. Do not expose the server to the public internet.

Control your iPhone with natural language using the Claude Agent SDK. This demo runs a local Mac server that Claude talks to, letting you send commands like:

- *"What's my iPhone's battery level?"*
- *"Take a screenshot of my iPhone"*
- *"Open the Wi-Fi settings on my iPhone"*
- *"List all apps installed on my iPhone"*
- *"Restart my iPhone"*

## How It Works

```
iPhone (Shortcuts app)
        │
        │  HTTP POST  {"command": "..."}
        ▼
Mac (localhost:3000)  ← server.ts (Express)
        │
        │  Claude Agent SDK
        ▼
Claude (claude-sonnet-4-6)
        │
        │  Bash tools
        ▼
libimobiledevice / devicectl / xcrun simctl
        │
        │  USB / Xcode
        ▼
iPhone / iOS Simulator
```

Claude Code itself does not run on iOS — it requires a desktop environment. This demo bridges the gap: a Mac-hosted server powered by the Claude Agent SDK accepts natural language commands (from your iPhone via Apple Shortcuts, from a browser, or from the terminal) and translates them into the right Mac CLI commands to inspect and manage a connected iPhone.

## Prerequisites

- macOS with [Xcode](https://developer.apple.com/xcode/) installed
- [Node.js 18+](https://nodejs.org) or [Bun](https://bun.sh)
- An [Anthropic API key](https://console.anthropic.com)
- For real device control: `brew install libimobiledevice`
- For simulator control: Xcode with iOS simulators installed

## Setup

### 1. Install dependencies

```bash
cd ios-claude-integration
npm install
# or: bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and set your ANTHROPIC_API_KEY
```

### 3. Install libimobiledevice (for real iPhone)

```bash
brew install libimobiledevice
```

Connect your iPhone via USB and trust the computer when prompted.

### 4. Start the server

```bash
npm run dev
# or: bun run dev
```

The server starts at `http://localhost:3000`.

## Usage

### From the terminal

```bash
# Check your iPhone's battery
curl -s -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "What is my iPhone battery level?"}' | jq .result

# Take a screenshot
curl -s -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "Take a screenshot of my iPhone and save it to /tmp/screen.png"}'

# Open Wi-Fi settings
curl -s -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "Open the Wi-Fi settings on my iPhone"}'

# List installed apps
curl -s -X POST http://localhost:3000/command \
  -H "Content-Type: application/json" \
  -d '{"command": "List the apps installed on my iPhone"}'
```

### From your iPhone (Apple Shortcuts)

You can trigger this server directly from your iPhone using the **Shortcuts** app:

1. Open the **Shortcuts** app on your iPhone
2. Tap **+** to create a new Shortcut
3. Add these actions in order:

   | Step | Action | Configuration |
   |------|--------|---------------|
   | 1 | **Ask for Input** | Prompt: "What do you want to do?" |
   | 2 | **Get Contents of URL** | URL: `http://<your-mac-ip>:3000/command`, Method: POST, Headers: `Content-Type: application/json`, Body (JSON): `{"command": "[Provided Input]"}` |
   | 3 | **Get Dictionary Value** | Key: `result`, from: Shortcuts Result |
   | 4 | **Show Result** | Input: Dictionary Value |

4. Find your Mac's IP: run `ipconfig getifaddr en0` in Terminal
5. Name the Shortcut (e.g., "Ask Claude about iPhone") and add it to your Home Screen

Now you can tap the Shortcut, type a question, and get Claude's response right on your phone.

## What Claude Can Do

| Task | Requires | Notes |
|------|----------|-------|
| Get battery level | libimobiledevice + USB | `ideviceinfo -k BatteryCurrentCapacity` |
| Get iOS version | libimobiledevice + USB | `ideviceinfo -k ProductVersion` |
| Take screenshot | libimobiledevice + USB | `idevicescreenshot` |
| List installed apps | libimobiledevice + USB | `ideviceinstaller -l` |
| Install/uninstall app | libimobiledevice + USB | Requires .ipa file |
| Restart device | libimobiledevice + USB | `idevicediagnostics restart` |
| Open Settings panels | USB or Simulator | Opens the correct Settings page; user taps the toggle |
| Full simulator control | Xcode | `xcrun simctl` commands |

## iOS Security Limits

iOS is sandboxed — apps and external tools **cannot directly toggle settings** (like Wi-Fi or Brightness) without user interaction. What you can do instead:

- **Open the right Settings screen** so the user taps the switch themselves
- **Use MDM configuration profiles** (enterprise environments) to enforce settings silently
- **Apple Shortcuts on-device** can control some settings (e.g., airplane mode, flashlight, volume)

## Architecture

- **`server.ts`** — Express HTTP server that receives commands and runs a Claude Agent SDK session per request
- **`agent/CLAUDE.md`** — System prompt that teaches Claude which CLI tools are available and how to use them
- The Claude Agent SDK spawns Claude Code in `agent/` as the working directory, so Claude has full context of the available tools

## Resources

- [Claude Agent SDK Documentation](https://platform.claude.com/docs/en/agent-sdk/overview)
- [libimobiledevice](https://libimobiledevice.org)
- [Apple devicectl](https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device)
- [xcrun simctl](https://nshipster.com/simctl/)
- [Apple Shortcuts User Guide](https://support.apple.com/guide/shortcuts/welcome/ios)
