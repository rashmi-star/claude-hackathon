/**
 * Agent team config — all agents are Claude Opus 4.6 with domain-specific expertise.
 * Frontend Agent: senior frontend engineer (a11y, UX, responsive design)
 * Backend Agent: senior backend engineer (API safety, validation, security)
 * Manager (PM): technical PM who triages and assigns work
 * Reflector: learns from each run and writes to memory
 */
export type AgentKind = "claude";

export interface AgentConfig {
  name: string;
  role: string;
  kind: AgentKind;
}

export const AGENTS: AgentConfig[] = [
  { name: "Frontend Agent", role: "Senior frontend engineer — a11y, UX, responsive design, loading states", kind: "claude" },
  { name: "Backend Agent", role: "Senior backend engineer — API safety, validation, security, caching", kind: "claude" },
  { name: "Manager", role: "Technical PM — triages issues, assigns to Frontend or Backend agent", kind: "claude" },
  { name: "Reflector", role: "Retrospective — learns from each run, improves next iteration", kind: "claude" },
];
