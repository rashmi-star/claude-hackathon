# Nexus — Autonomous AI Engineering Team

**One instruction in, real patches out.** Built entirely with **Claude Opus 4.6**.

Nexus is an autonomous AI engineering team that turns a single natural-language instruction into verified code patches, eliminating the coordination busywork between PMs, frontend, and backend engineers. Six Claude Opus 4.6 agents work as a coordinated team: Router decides the focus area, Frontend and Backend agents scan with domain expertise, Manager prioritizes and assigns like a PM, Detect performs deep code review, Plan creates targeted tasks, and Patch generates real unified diffs, applied via git and verified with a real build. Opus 4.6 isn't used as a single prompt. It powers six distinct steps with different system prompts, extended thinking visible in the UI, and structured JSON contracts between agents. A Reflector agent saves learnings to persistent memory so every run makes the next one smarter, and the system also learns from external technical articles automatically. No hardcoded rules. Every decision is made by Claude.

---

## How It Works

```
Instruction
    ↓
[Claude: Router]        ← decides: frontend, backend, or full-stack
    ↓
[Frontend Agent]  [Backend Agent]   ← Claude scans the repo with domain expertise
    ↓
[Claude: Manager]       ← prioritizes issues, assigns to the right agent
    ↓
[Claude: Detect]        ← deep code review with memory from past runs
    ↓
[Claude: Plan]          ← creates 2-3 targeted tasks
    ↓
[Claude: Patch]         ← generates a unified diff (real git patch)
    ↓
[Apply]  →  [Verify]    ← git apply + npm run build
    ↓
[Claude: Reflector]     ← extracts learnings → Memory
    ↓
Memory ──→ fed back into Detect + Plan on the next run
```

**Six distinct Claude steps** in one pipeline, with extended thinking visible in the UI.

---

## Features

- **Multi-agent orchestration** — Frontend, Backend, Manager, Reflector agents, each with domain-specific expertise
- **Two modes** — Scan-only (find issues) or Instruction mode (find + fix)
- **Memory across runs** — Reflector learns from each run; memory improves future detection and planning
- **Continuous learning** — Sync from Codrops RSS: Claude reads full articles, extracts only relevant coding techniques
- **Real patches** — Unified diff format, apply locally with `git apply` or create a GitHub PR
- **Build verification** — Runs `npm run build` on the target repo after patching
- **Extended thinking** — Claude's reasoning visible for Detect, Plan, Patch, and Manager steps
- **Pipeline resilience** — Detect failures don't stall the pipeline; instruction drives planning even with no detected issues

---

## Quick Start

### 1. Clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/nexus.git
cd nexus
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment

Copy `.env.example` to `.env.local` and add your keys:

```bash
cp .env.example .env.local
```

```env
# Required — get from https://console.anthropic.com
ANTHROPIC_API_KEY=your_key_here

# Optional — for Create PR feature (needs repo scope)
GITHUB_TOKEN=your_github_token_here

# Optional — pre-fill the target repo path in the UI
NEXT_PUBLIC_DEFAULT_REPO=/path/to/your/target/repo
```

### 4. Start the dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Set target repo

Point **Target repo** to any Next.js/TypeScript project you want to improve. A sample target (`demo-next/`) is included:

```bash
cd demo-next && npm install
```

Then set the repo path in the dashboard to the absolute path of `demo-next/`.

### 6. Run

- **Scan Code** — Claude agents review the repo and report issues
- **Fix Issues** — After scanning, generate plan + patch for found issues
- **Run with Instruction** — Type any instruction (e.g., "Add accessibility improvements and loading states") and run the full pipeline
- **Quick Demo** — One-click: scan → detect → plan → patch → apply → verify

---

## Sample Target: `demo-next/`

Included as a sample Next.js app for Nexus to analyze and patch. It has intentional gaps (missing ARIA labels, no input validation, basic empty states) that Nexus can detect and fix.

```bash
cd demo-next
npm install
npm run dev -- -p 3001
```

---

## Project Structure

```
nexus/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Main dashboard UI
│   │   ├── layout.tsx                  # Root layout with theme provider
│   │   ├── globals.css                 # Tailwind styles
│   │   └── api/
│   │       ├── run/route.ts            # Step 1: Frontend + Backend agent scans
│   │       ├── manager/route.ts        # Step 2: PM prioritizes and assigns
│   │       ├── router/route.ts         # Step 3: Claude Router (FE/BE/full)
│   │       ├── detect/route.ts         # Step 4: Deep code review
│   │       ├── plan/route.ts           # Step 5: Task planning
│   │       ├── patch/route.ts          # Step 6: Patch generation
│   │       ├── apply/route.ts          # Apply patch (git apply)
│   │       ├── verify/route.ts         # Verify build (npm run build)
│   │       ├── reflect/route.ts        # Reflector: extract learnings
│   │       ├── memory/route.ts         # Read memory
│   │       ├── sync-knowledge/route.ts # Codrops RSS → learnings
│   │       ├── create-pr/route.ts      # Create GitHub PR
│   │       └── ...
│   ├── config/
│   │   ├── agents.ts                   # Agent definitions
│   │   ├── prompts.ts                  # System prompts for all agents
│   │   └── defaults.ts                 # Default instructions (env-driven)
│   ├── components/                     # UI components (shadcn/ui)
│   └── lib/
│       ├── utils.ts                    # Tailwind merge utils
│       └── extract-thinking.ts         # Extract Claude thinking blocks
├── demo-next/                          # Sample target repo
├── public/
│   └── architecture.html               # Architecture diagram
├── scripts/
│   └── check-model.js                  # Verify Claude API access
├── .env.example                        # Environment template
├── DEMO.md                             # Demo script, slides, voiceover
└── package.json
```

---

## Use Cases

| Use case | Example instruction |
|----------|-------------------|
| **Accessibility** | "Add ARIA labels, focus rings, and keyboard navigation to all interactive elements" |
| **Loading states** | "Add skeleton loaders for the Knowledge base results while search is loading" |
| **API safety** | "Add input validation with Zod and consistent error responses for all API routes" |
| **Performance** | "Optimize images, add lazy loading, reduce layout shift" |
| **Empty states** | "Make the 'No results found' state friendlier with an icon and suggestions" |

---

## Architecture

All six pipeline steps use **Claude Opus 4.6** with extended thinking enabled:

| Step | Agent | What it does |
|------|-------|-------------|
| 1 | **Router** | Decides focus: frontend-only, backend-only, or full-stack |
| 2 | **Frontend + Backend** | Scan repo with domain-specific expertise |
| 3 | **Manager (PM)** | Prioritizes issues, assigns to the right agent |
| 4 | **Detect** | Deep code review informed by memory from past runs |
| 5 | **Plan** | Creates 2-3 targeted, safe tasks |
| 6 | **Patch** | Generates unified diff with precise context |
| 7 | **Apply + Verify** | `git apply` + `npm run build` |
| 8 | **Reflector** | Extracts learnings → saves to memory |

**Memory** (persisted in `runs/memory.json`) feeds back into Detect and Plan, making each run smarter.

**Continuous learning**: "Sync from Codrops" fetches the latest articles, Claude reads the full content, and only adds actionable coding techniques to memory. Keeps iterating through articles until it finds one with real learnings.

---

## Tech Stack

- **Next.js 16** + **React 19** + **TypeScript**
- **Claude Opus 4.6** (Anthropic API) — all agent intelligence
- **Tailwind CSS 4** + **shadcn/ui** — dashboard UI
- **Git** — patch application and verification

---

## Hackathon Submission Notes

**Use of Claude Opus 4.6:** Claude is not used as a single code-generation prompt. It powers six distinct steps in a coordinated pipeline — Router, Detect, Plan, Patch, Manager, and Reflector — each with domain-specific system prompts and extended thinking. Memory persists across runs so the system genuinely learns.

**What makes it unique:** Claude doesn't just generate code; it decides which parts of the codebase to focus on, prioritizes issues like a PM, assigns work to the right agent, and writes learnings that future runs actually use. Multiple use cases on the same repo (a11y, API safety, deps, performance) show it's a platform, not a one-off demo.

---

## License

MIT
