# KhaanRate — Mongolian SME Loan SaaS Orchestrator (Production 1.0)

Core mission: Issue uncollateralized, cash-flow-based working capital loans to Mongolian MSMEs (1M–50M MNT), prioritizing women-owned businesses for 2X Challenge capital.

## Architecture (Layer Overview)
- **Layer I — Intent & Governance**: Hard constraints (FRC 20% single borrower limit), optimization targets (RAROC, cash-flow predictability), human override.
- **Layer II — Orchestration & Execution**: Autonomous swarms (Ingestion & Verification, Cognitive Underwriting, Servicing & Collections) communicating via ACP.
- **Layer III — Verification & Auditability**: Provenance receipts, cost-to-verify reduction, macro-shock/graceful degradation.

## Tech Stack
- Node.js (TypeScript) + Fastify
- PostgreSQL + Prisma (identity, loan applications)
- Redis (caching + job queue)
- MongoDB (optional audit/logs)
- MCP server for E-barimt/VAT & bank integrations
- Supabase (auth, alerts, user management)
- Telegram bot for alerts & UX

## Quick Start (Local)
1. Copy `.env.example` → `.env` and fill real Supabase, Telegram, and API keys.
2. Install deps: `npm install`
3. Start: `npm start`
4. API: HTTP REST + WebSocket rates; MCP endpoints exposed via stdio.

## Deployment Checklist
- VPS with Ubuntu, firewall, Docker (optional)
- DNS + TLS (Let's Encrypt)
- PM2 process manager or Docker Compose
- Supabase credentials and MCP server connectivity
- Telegram bot token & chat ID
- Payment provider test mode integration

## Notes
- Rate fetchers support XacBank, GolomtBank, StateBank, TDBM, TransBank with graceful fallbacks.
- Cache TTL 15 min; outlier detection flags stale/degraded banks.
- Designed for horizontal scaling; Redis-backed queues and rate limiters included.
