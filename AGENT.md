# Agent Demos Repository Overview

This repository features several demonstration applications built with the **Claude Agent SDK**, showcasing diverse approaches to developing AI-powered solutions using Claude.

## Key Technologies and Frameworks

The core technology across all demos is the **Claude Agent SDK**. Auxiliary technologies include:
- **Languages**: TypeScript, Python
- **Runtimes**: Node.js, Bun (JavaScript), Python
- **Frontend/UI**: React, TailwindCSS, Jotai
- **Desktop**: Electron
- **Data Management**: SQLite3, IMAP, ExcelJS, XLSX, OpenPyXL (Python)
- **Tooling**: Webpack, Jest, ESLint, TypeScript, Zod, Python-dotenv

## Main Features and Architectural Patterns

The repository presents three distinct application types:

1.  **Email Agent**: A web-based email client using a client-server architecture. It integrates with IMAP for email management and utilizes the Claude Agent SDK for AI-driven email search and assistance.
2.  **Excel Demo**: A desktop application built with Electron, featuring a React frontend and Python backend components. It demonstrates AI-powered spreadsheet generation, data analysis, and manipulation, integrating with `exceljs`/`xlsx` and `openpyxl`.
3.  **Research Agent**: A sophisticated multi-agent system orchestrated in Python. It employs a Lead Agent to decompose tasks, Researcher Agents for parallel web search, and a Report-Writer Agent to synthesize findings. It leverages SDK hooks for detailed subagent activity tracking and observability.

These demos collectively illustrate the versatility of the Claude Agent SDK in building intelligent applications across various platforms and architectural styles.
