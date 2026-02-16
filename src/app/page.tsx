"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModeToggle } from "@/components/mode-toggle";
import { AGENTS } from "@/config/agents";
import { defaultInstruction as configDefaultInstruction, defaultRepoPath as configDefaultRepo, quickDemoInstruction as configQuickDemoInstruction } from "@/config/defaults";

type AgentStatus = "Idle" | "Running" | "Done" | "Failed";

interface AgentState {
  name: string;
  status: AgentStatus;
  logs: string[];
  lastUpdated: string;
  thinking?: string;
}

interface MemoryItem {
  id: string;
  text: string;
  tags: string[];
  score: number;
}

interface PlanTask {
  taskId: string;
  goal: string;
  files?: string[];
  why?: string;
}

interface RunArtifacts {
  frontend?: { issues: { id: string; message: string }[] };
  backend?: { issues: { id: string; message: string }[] };
  manager?: { top: { id: string; reason: string; priority: number; agent?: "frontend" | "backend" }[]; deferred: { id: string; reason: string; priority: number; agent?: "frontend" | "backend" }[] };
  claudeDetect?: { issues: { id: string; title: string; severity: string; file: string; rationale: string; suggestedFix: string }[] };
  plan?: { top: PlanTask[]; guardrails?: string[] };
  reflect?: { summary: string; learnings: { text: string; tags: string[] }[] };
  patch?: string;
  /** First 45 lines of patch with line numbers (for debug when apply fails). */
  patchPreview?: string;
  /** Raw text Claude returned for patch (for debug when apply fails). */
  claudePatchRaw?: string;
  router?: { focusFrontend: boolean; focusBackend: boolean };
  frontendThinking?: string;
  backendThinking?: string;
  detectThinking?: string;
  planThinking?: string;
  patchThinking?: string;
  managerThinking?: string;
}

function getStatusBadgeVariant(status: AgentStatus): "secondary" | "default" | "outline" | "destructive" {
  switch (status) {
    case "Idle":
      return "secondary";
    case "Running":
      return "default";
    case "Done":
      return "outline";
    case "Failed":
      return "destructive";
    default:
      return "secondary";
  }
}

/** During E2E, return one agent-specific log line so the left panel shows each agent doing something. */
function getAgentLogForE2EStep(agentName: string, e2eStatus: string): string {
  const s = e2eStatus.toLowerCase();
  if (s.includes("scanning") || s.includes("step 1")) {
    if (agentName === "Frontend Agent") return "[INFO] Reviewing UI, a11y, loading states, responsive design...";
    if (agentName === "Backend Agent") return "[INFO] Reviewing API safety, validation, error handling...";
    if (agentName === "Manager") return "[INFO] Waiting for agent scans...";
    if (agentName === "Reflector") return "[INFO] Will learn after run.";
    return "[INFO] Agents scanning...";
  }
  if (s.includes("manager") || s.includes("step 2")) {
    if (agentName === "Frontend Agent") return "[INFO] Scan complete. Findings sent to PM.";
    if (agentName === "Backend Agent") return "[INFO] Scan complete. Findings sent to PM.";
    if (agentName === "Manager") return "[INFO] Triaging issues, assigning to agents...";
    if (agentName === "Reflector") return "[INFO] Will learn after run.";
    return "[INFO] PM triaging...";
  }
  if (s.includes("router") || s.includes("step 3")) {
    if (agentName === "Reflector") return "[INFO] Will learn after run.";
    return "[INFO] Routing to focused agent...";
  }
  if (s.includes("detect") || s.includes("step 4")) {
    if (agentName === "Reflector") return "[INFO] Will learn after run.";
    return "[INFO] Deep analysis of findings...";
  }
  if (s.includes("plan") || s.includes("step 5")) {
    if (agentName === "Reflector") return "[INFO] Will learn after run.";
    return "[INFO] Planning changes...";
  }
  if (s.includes("patch") || s.includes("step 6")) {
    if (agentName === "Reflector") return "[INFO] Will learn after run.";
    return "[INFO] Generating code changes...";
  }
  if (s.includes("reflect")) {
    if (agentName === "Reflector") return "[INFO] Writing learnings to memory...";
    return "[INFO] Done. See results on the right.";
  }
  if (s.includes("scan complete")) {
    if (agentName === "Frontend Agent") return "[INFO] Review complete. See findings.";
    if (agentName === "Backend Agent") return "[INFO] Review complete. See findings.";
    if (agentName === "Manager") return "[INFO] Ready to triage.";
    if (agentName === "Reflector") return "[INFO] Waiting for full run.";
    return "[INFO] Scan complete.";
  }
  return `[INFO] ${e2eStatus}`;
}

function buildAgentLogsFromArtifacts(artifacts: RunArtifacts | null): AgentState[] {
  if (!artifacts) return AGENTS.map((a) => ({ name: a.name, status: "Idle" as AgentStatus, logs: ["[INFO] Waiting for analysis..."], lastUpdated: "—" }));

  const fe = artifacts.frontend?.issues ?? [];
  const be = artifacts.backend?.issues ?? [];
  const top = artifacts.manager?.top ?? [];
  const reflect = artifacts.reflect;
  const router = artifacts.router;
  const focusFrontend = router?.focusFrontend !== false;
  const focusBackend = router?.focusBackend !== false;

  const toFrontend = top.filter((t) => (t as { agent?: string }).agent === "frontend").map((t) => t.id);
  const toBackend = top.filter((t) => (t as { agent?: string }).agent === "backend").map((t) => t.id);
  const managerLogs: string[] = top.length
    ? [
        "[INFO] Split job from your instruction:",
        ...(toFrontend.length ? [`[INFO] → Gave to Frontend Agent: ${toFrontend.join(", ")}`] : []),
        ...(toBackend.length ? [`[INFO] → Gave to Backend Agent: ${toBackend.join(", ")}`] : []),
        ...(toFrontend.length === 0 && toBackend.length === 0 ? [`[INFO] Prioritized: ${top.map((t) => t.id).join(", ")}`] : []),
        "[INFO] → Detect & Plan (right) use this split.",
      ]
    : ["[INFO] No issues to split.", "[INFO] → Claude used your instruction for Plan & Patch (right)."];

  return [
    { name: "Frontend Agent", status: "Done" as AgentStatus, thinking: artifacts.frontendThinking, logs: !focusFrontend ? ["[INFO] Skipped (Claude focused on backend this run)"] : fe.length ? [`[INFO] Found ${fe.length} issues: ${fe.map((i) => i.id).join(", ")}`, "[INFO] → fed into Detect & Plan (right)."] : ["[INFO] No frontend issues found.", "[INFO] → Claude still used your instruction (right)."], lastUpdated: new Date().toLocaleTimeString() },
    { name: "Backend Agent", status: "Done" as AgentStatus, thinking: artifacts.backendThinking, logs: !focusBackend ? ["[INFO] Skipped (Claude focused on frontend this run)"] : be.length ? [`[INFO] Found ${be.length} issues: ${be.map((i) => i.id).join(", ")}`, "[INFO] → fed into Detect & Plan (right)."] : ["[INFO] No backend issues found.", "[INFO] → Claude still used your instruction (right)."], lastUpdated: new Date().toLocaleTimeString() },
    { name: "Manager", status: "Done" as AgentStatus, thinking: artifacts.managerThinking, logs: managerLogs, lastUpdated: new Date().toLocaleTimeString() },
    { name: "Reflector", status: "Done" as AgentStatus, logs: reflect?.summary ? [`[INFO] ${reflect.summary}`, "[INFO] Written to memory for next run."] : ["[INFO] Run complete.", "[INFO] Learnings saved to memory."], lastUpdated: new Date().toLocaleTimeString() },
  ];
}

export default function Home() {
  const [repoPath, setRepoPath] = useState("");
  const [instruction, setInstruction] = useState("");
  const [autoApply, setAutoApply] = useState(false);
  /** When true, E2E never calls Apply/Verify — use for hackathon demo so the flow always completes. */
  const [skipApplyDemo, setSkipApplyDemo] = useState(false);
  const [appStatus, setAppStatus] = useState<"Idle" | "Syncing" | "E2E">("Idle");
  // Pre-fill repo path from env after mount (avoids hydration mismatch). If client didn't get NEXT_PUBLIC_*, fetch from API.
  useEffect(() => {
    const setDefault = (path: string) => path && setRepoPath((prev) => prev || path);
    setDefault(configDefaultRepo);
    if (!configDefaultRepo) {
      fetch("/api/default-repo")
        .then((r) => r.json())
        .then((d) => setDefault(d.repo || ""))
        .catch(() => {});
    }
  }, []);
  const [agents, setAgents] = useState<AgentState[]>(
    AGENTS.map((a) => ({
      name: a.name,
      status: "Idle" as AgentStatus,
      logs: ["[INFO] Waiting for analysis..."],
      lastUpdated: "—",
    }))
  );
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memorySearch, setMemorySearch] = useState("");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [codropsMessage, setCodropsMessage] = useState<string | null>(null);
  const [codropsSyncing, setCodropsSyncing] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runDuration, setRunDuration] = useState("—");
  const [artifacts, setArtifacts] = useState<RunArtifacts | null>(null);
  const [e2eStatus, setE2eStatus] = useState("");
  const [e2eElapsed, setE2eElapsed] = useState(0);
  /** When set, patch was applied to this repo path — show "changes applied, open your app to see them". */
  const [lastAppliedRepo, setLastAppliedRepo] = useState<string | null>(null);
  const [verifyErrorDetails, setVerifyErrorDetails] = useState<string | null>(null);
  /** When apply fails, git apply stderr so user can see why (e.g. patch doesn't apply). */
  const [applyErrorDetails, setApplyErrorDetails] = useState<string | null>(null);
  /** Result of last "Check" on target repo: exists + is git. */
  const [repoCheck, setRepoCheck] = useState<{ ok: boolean; exists?: boolean; isGit?: boolean; error?: string } | null>(null);
  /** When patch was generated but git apply --check failed (patch may not apply cleanly). */
  const [applyCheckWarning, setApplyCheckWarning] = useState<string | null>(null);
  const runStartRef = useRef<number | null>(null);

  const handleCheckRepo = async () => {
    const pathToUse = repoPath.trim() || configDefaultRepo;
    setRepoCheck(null);
    try {
      const res = await fetch("/api/check-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: pathToUse }),
      });
      const data = await res.json();
      setRepoCheck({ ok: data.ok, exists: data.exists, isGit: data.isGit, error: data.error });
    } catch {
      setRepoCheck({ ok: false, error: "Check failed" });
    }
  };

  const loadMemories = async (): Promise<number> => {
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      if (data.ok && Array.isArray(data.memories)) {
        setMemories(data.memories);
        return data.memories.length;
      }
    } catch {
      /* ignore */
    }
    return 0;
  };

  const handleSyncSources = async () => {
    setAppStatus("Syncing");
    setSyncMessage(null);
    const count = await loadMemories();
    setSyncMessage(`Loaded ${count} memories from past runs`);
    setAppStatus("Idle");
  };

  const handleSyncCodrops = async () => {
    setCodropsMessage(null);
    setCodropsSyncing(true);
    try {
      const res = await fetch("/api/sync-knowledge", { method: "POST" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Sync failed");
      await loadMemories();
      const checked = data.articlesChecked ?? 1;
      const skippedList: string[] = data.skippedArticles ?? [];
      if (data.skipped) {
        const summary = skippedList.length > 0
          ? skippedList.map((s: string) => `  - ${s}`).join("\n")
          : "";
        setCodropsMessage(`Checked ${checked} articles — none had actionable coding techniques.\n${summary}`);
      } else {
        const articleInfo = data.article?.title ? `"${data.article.title}"` : "";
        const skippedNote = skippedList.length > 0 ? ` (skipped ${skippedList.length} irrelevant)` : "";
        setCodropsMessage(`Checked ${checked} article${checked > 1 ? "s" : ""}${skippedNote} — found ${articleInfo}. Added ${data.added ?? 0} techniques to memory.`);
      }
    } catch (e) {
      setCodropsMessage(`Error: ${e instanceof Error ? e.message : "Sync failed"}`);
    }
    setCodropsSyncing(false);
  };

  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then((d) => d.ok && Array.isArray(d.memories) && setMemories(d.memories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (appStatus !== "E2E") return;
    const start = runStartRef.current ?? Date.now();
    const interval = setInterval(() => {
      setE2eElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [appStatus]);

  // During E2E, show agent-specific messages so the left panel shows each agent doing something
  useEffect(() => {
    if (appStatus !== "E2E" || !e2eStatus) return;
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        status: "Running" as AgentStatus,
        logs: ["[INFO] Running end-to-end pipeline...", getAgentLogForE2EStep(a.name, e2eStatus)],
        lastUpdated: new Date().toLocaleTimeString(),
      }))
    );
  }, [appStatus, e2eStatus]);

  /** Scan-only: agents review the code and show issues. No changes made. */
  const handleScan = async () => {
    if (appStatus !== "Idle") return;
    const pathToUse = repoPath.trim() || configDefaultRepo;
    if (!pathToUse) {
      setE2eStatus("Set target repo path first.");
      return;
    }
    setAppStatus("E2E");
    setRunId(null);
    setArtifacts(null);
    setApplyErrorDetails(null);
    setApplyCheckWarning(null);
    setLastAppliedRepo(null);
    setE2eStatus("Scanning: Claude agents reviewing code...");
    setE2eElapsed(0);
    runStartRef.current = Date.now();
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        status: "Running" as AgentStatus,
        logs: ["[INFO] Starting code review..."],
        lastUpdated: new Date().toLocaleTimeString(),
      }))
    );

    try {
      const runRes = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: pathToUse, mode: "scan" }),
      });
      const runData = await runRes.json();
      if (!runData.ok) throw new Error(runData.error || "Scan failed");
      const rid = runData.runId;
      setRunId(rid);

      setE2eStatus("PM triaging findings...");
      try {
        await fetch("/api/manager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid }),
        });
      } catch {
        /* manager is optional for scan */
      }

      // Fetch artifacts to display
      const pollRes = await fetch(`/api/run/${rid}`);
      const pollData = await pollRes.json();
      const scanArtifacts: RunArtifacts = {
        ...pollData.artifacts,
        router: { focusFrontend: true, focusBackend: true },
      };
      setArtifacts(scanArtifacts);
      setAgents(buildAgentLogsFromArtifacts(scanArtifacts));
      setRunDuration(`${((Date.now() - (runStartRef.current ?? 0)) / 1000).toFixed(1)}s`);

      const feCount = scanArtifacts.frontend?.issues?.length ?? 0;
      const beCount = scanArtifacts.backend?.issues?.length ?? 0;
      setE2eStatus(`Scan complete: ${feCount + beCount} issues found (${feCount} frontend, ${beCount} backend). Click "Fix Issues" to generate patches.`);
      setAppStatus("Idle");
    } catch (err) {
      setE2eStatus(`Scan failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setAppStatus("Idle");
      setAgents((prev) =>
        prev.map((a) => ({
          ...a,
          status: "Failed" as AgentStatus,
          logs: [...a.logs, `[ERROR] ${err instanceof Error ? err.message : "Unknown error"}`],
          lastUpdated: new Date().toLocaleTimeString(),
        }))
      );
    }
  };

  /** Fix Issues: takes existing scan results and runs detect → plan → patch to fix them. */
  const handleFixIssues = async () => {
    if (appStatus !== "Idle" || !runId || !artifacts) return;
    const pathToUse = repoPath.trim() || configDefaultRepo;
    const rid = runId;
    const instr = instruction.trim() || "Fix all issues found by the agents. Prioritize high-severity issues.";

    setAppStatus("E2E");
    setE2eStatus("Step 1/4: Claude Router...");
    setE2eElapsed(0);
    runStartRef.current = Date.now();
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        status: "Running" as AgentStatus,
        logs: [...a.logs, "[INFO] Fixing issues..."],
        lastUpdated: new Date().toLocaleTimeString(),
      }))
    );

    try {
      const routerRes = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instr }),
      });
      const routerData = await routerRes.json();
      const router = routerData.ok
        ? { focusFrontend: routerData.focusFrontend !== false, focusBackend: routerData.focusBackend !== false }
        : { focusFrontend: true, focusBackend: true };

      setE2eStatus("Step 2/4: Claude Detect... (~20-30s)");
      let detectData: { ok: boolean; detect?: { issues?: unknown[] }; thinking?: string; error?: string } = { ok: false };
      try {
        const detectRes = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid, repoPath: pathToUse, instruction: instr, router }),
        });
        detectData = await detectRes.json();
        if (!detectData.ok) {
          console.warn("[E2E-Fix] Detect returned non-ok, continuing with scan results:", detectData.error);
        }
      } catch (e) {
        console.warn("[E2E-Fix] Detect failed, continuing with scan results:", e);
      }

      const pollRes2 = await fetch(`/api/run/${rid}`);
      const pollData2 = await pollRes2.json();
      const signals = {
        frontendScan: pollData2.artifacts?.frontend,
        backendScan: pollData2.artifacts?.backend,
        claudeDetect: detectData.detect ?? pollData2.artifacts?.claudeDetect ?? { issues: [] },
      };

      setE2eStatus("Step 3/4: Claude Plan... (~15-20s)");
      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: rid, instruction: instr, signals, router }),
      });
      const planData = await planRes.json();
      if (!planData.ok) throw new Error(planData.error || "Plan failed");

      setE2eStatus("Step 4/4: Claude Patch... (~30-45s)");
      const patchRes = await fetch("/api/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: rid,
          repoPath: pathToUse,
          instruction: instr,
          plan: planData.plan,
          signals: { issues: detectData.detect?.issues },
        }),
      });
      const patchData = await patchRes.json();
      if (!patchData.ok) {
        const finalRes = await fetch(`/api/run/${rid}`);
        const finalData = await finalRes.json();
        const partialArtifacts: RunArtifacts = {
          ...finalData.artifacts,
          claudeDetect: detectData.detect ?? finalData.artifacts?.claudeDetect,
          plan: planData.plan,
          router,
          detectThinking: detectData.thinking,
          planThinking: planData.thinking,
        };
        setArtifacts(partialArtifacts);
        setAgents(buildAgentLogsFromArtifacts(partialArtifacts));
        setRunDuration(`${((Date.now() - (runStartRef.current ?? 0)) / 1000).toFixed(1)}s`);
        setE2eStatus(`Patch failed: ${patchData.error || "Claude did not return a valid git diff"}`);
        setAppStatus("Idle");
        return;
      }

      // Reflect
      setE2eStatus("Reflecting & saving learnings...");
      const finalRes = await fetch(`/api/run/${rid}`);
      const finalData = await finalRes.json();
      let artifactsToSet = finalData.artifacts;

      try {
        const reflectRes = await fetch("/api/reflect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid }),
        });
        const reflectData = await reflectRes.json();
        if (reflectData.ok && reflectData.reflect) {
          artifactsToSet = { ...artifactsToSet, reflect: reflectData.reflect };
        }
        await loadMemories();
      } catch {
        /* ignore */
      }

      const artifactsWithRouter = {
        ...artifactsToSet,
        router,
        detectThinking: detectData.thinking ?? (artifactsToSet as RunArtifacts).detectThinking,
        planThinking: planData.thinking ?? (artifactsToSet as RunArtifacts).planThinking,
        patchThinking: patchData.thinking ?? (artifactsToSet as RunArtifacts).patchThinking,
      };
      setArtifacts(artifactsWithRouter);
      setAgents(buildAgentLogsFromArtifacts(artifactsWithRouter));
      setApplyCheckWarning(patchData.applyCheckError || null);
      setRunDuration(`${((Date.now() - (runStartRef.current ?? 0)) / 1000).toFixed(1)}s`);
      setE2eStatus("Patch ready. Review and apply below.");
      setAppStatus("Idle");
    } catch (err) {
      setE2eStatus(`Fix failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setAppStatus("Idle");
    }
  };

  const handleRunE2E = async (overrides?: { instruction?: string; autoApply?: boolean }) => {
    if (appStatus === "E2E") return;
    const pathToUse = repoPath.trim() || configDefaultRepo;
    const instr = (overrides?.instruction ?? instruction).trim() || configDefaultInstruction;
    const doAutoApply = overrides?.autoApply ?? autoApply;
    if (!pathToUse) {
      setE2eStatus("Set target repo path first (or set NEXT_PUBLIC_DEFAULT_REPO in .env.local).");
      return;
    }
    setAppStatus("E2E");
    setRunId(null);
    setArtifacts(null);
    setApplyErrorDetails(null);
    setApplyCheckWarning(null);
    setE2eStatus("Starting run...");
    setE2eElapsed(0);
    runStartRef.current = Date.now();
    setAgents((prev) =>
      prev.map((a) => ({
        ...a,
        status: "Running" as AgentStatus,
        logs: ["[INFO] Running end-to-end pipeline..."],
        lastUpdated: new Date().toLocaleTimeString(),
      }))
    );

    try {
      setVerifyErrorDetails(null);
    setE2eStatus("Step 1/6: Claude agents scanning repo... (~20-30s)");
      const runRes = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: pathToUse, instruction: instr, mode: "task" }),
      });
      const runData = await runRes.json();
      if (!runData.ok) throw new Error(runData.error || "Run failed");
      const rid = runData.runId;
      setRunId(rid);

      setE2eStatus("Step 2/6: Claude PM (prioritize & assign)...");
      try {
        const mgrRes = await fetch("/api/manager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid, instruction: instr }),
        });
        const mgrData = await mgrRes.json();
        if (!mgrData.ok) {
          console.warn("[E2E] Claude Manager skipped:", mgrData.error);
        }
      } catch (e) {
        console.warn("[E2E] Claude Manager failed:", e);
      }

      setE2eStatus("Step 3/6: Claude Router...");
      const routerRes = await fetch("/api/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instr }),
      });
      const routerData = await routerRes.json();
      const router = routerData.ok
        ? { focusFrontend: routerData.focusFrontend !== false, focusBackend: routerData.focusBackend !== false }
        : { focusFrontend: true, focusBackend: true };

      setE2eStatus("Step 4/6: Claude Detect... (~20-30s)");
      let detectData: { ok: boolean; detect?: { issues?: unknown[] }; thinking?: string; error?: string } = { ok: false };
      try {
        const detectRes = await fetch("/api/detect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid, repoPath: pathToUse, instruction: instr, router }),
        });
        detectData = await detectRes.json();
        if (!detectData.ok) {
          console.warn("[E2E] Detect returned non-ok, continuing with instruction-only plan:", detectData.error);
        }
      } catch (e) {
        console.warn("[E2E] Detect failed, continuing with instruction-only plan:", e);
      }

      const pollRes2 = await fetch(`/api/run/${rid}`);
      const pollData2 = await pollRes2.json();
      const signals = {
        frontendScan: pollData2.artifacts?.frontend,
        backendScan: pollData2.artifacts?.backend,
        claudeDetect: detectData.detect ?? pollData2.artifacts?.claudeDetect ?? { issues: [] },
      };

      setE2eStatus("Step 5/6: Claude Plan... (~15-20s)");
      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: rid, instruction: instr, signals, router }),
      });
      const planData = await planRes.json();
      if (!planData.ok) throw new Error(planData.error || "Plan failed");

      setE2eStatus("Step 6/6: Claude Patch... (~30-45s)");
      const patchRes = await fetch("/api/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: rid,
          repoPath: pathToUse,
          instruction: instr,
          plan: planData.plan,
          signals: { issues: detectData.detect?.issues },
        }),
      });
      const patchData = await patchRes.json();
      if (!patchData.ok) {
        setApplyCheckWarning(null);
        // Patch failed — still show Claude's Plan and Detect so the user sees planning output
        const finalRes = await fetch(`/api/run/${rid}`);
        const finalData = await finalRes.json();
        const partialArtifacts: RunArtifacts = {
          ...finalData.artifacts,
          claudeDetect: detectData.detect ?? finalData.artifacts?.claudeDetect,
          plan: planData.plan,
          router,
          detectThinking: detectData.thinking,
          planThinking: planData.thinking,
        };
        setArtifacts(partialArtifacts);
        setAgents(buildAgentLogsFromArtifacts(partialArtifacts));
        setRunId(rid);
        setRunDuration(`${((Date.now() - (runStartRef.current ?? 0)) / 1000).toFixed(1)}s`);
        setE2eStatus(`Patch failed: ${patchData.error || "Claude did not return a valid git diff"}`);
        setAppStatus("Idle");
        return;
      }

      const finalRes = await fetch(`/api/run/${rid}`);
      const finalData = await finalRes.json();
      let artifactsToSet = finalData.artifacts;

      setE2eStatus("POST /api/reflect...");
      try {
        const reflectRes = await fetch("/api/reflect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid }),
        });
        const reflectData = await reflectRes.json();
        if (reflectData.ok && reflectData.reflect) {
          artifactsToSet = { ...artifactsToSet, reflect: reflectData.reflect };
        }
        await loadMemories();
      } catch {
        /* ignore */
      }

      const artifactsWithRouter = {
        ...artifactsToSet,
        router,
        detectThinking: detectData.thinking ?? (artifactsToSet as RunArtifacts).detectThinking,
        planThinking: planData.thinking ?? (artifactsToSet as RunArtifacts).planThinking,
        patchThinking: patchData.thinking ?? (artifactsToSet as RunArtifacts).patchThinking,
      };
      setArtifacts(artifactsWithRouter);
      setAgents(buildAgentLogsFromArtifacts(artifactsWithRouter));
      setApplyCheckWarning(patchData.applyCheckError || null);

      if (doAutoApply && !skipApplyDemo) {
        setApplyErrorDetails(null);
        setE2eStatus("POST /api/apply...");
        const applyRes = await fetch("/api/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: rid, repoPath: pathToUse }),
        });
        const applyData = await applyRes.json();
        if (!applyData.ok) {
          setApplyErrorDetails(applyData.details || applyData.error || null);
          const errLine = applyData.details?.split(/\r?\n/)[0]?.trim();
          setE2eStatus(errLine ? `Apply failed: ${errLine}` : `Apply failed: ${applyData.error || "Patch could not be applied"}`);
          setRunDuration(`${((Date.now() - (runStartRef.current ?? 0)) / 1000).toFixed(1)}s`);
          setAppStatus("Idle");
          return;
        }
        setE2eStatus("Verifying build...");
        const verifyRes = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoPath: pathToUse }),
        });
        const verifyData = await verifyRes.json();
        setLastAppliedRepo(pathToUse);
        if (verifyData.ok && verifyData.verified) {
          setE2eStatus("Patch applied successfully. Verified.");
          setVerifyErrorDetails(null);
          setApplyCheckWarning(null);
        } else {
          setE2eStatus("Patch applied. Verification failed: Build failed.");
          setVerifyErrorDetails(verifyData.details || verifyData.error || null);
        }
      } else if (skipApplyDemo) {
        setE2eStatus("Patch ready (demo — apply skipped).");
      } else {
        setE2eStatus("Patch ready. Click Apply Patch to apply.");
      }

      setRunDuration(`${((Date.now() - (runStartRef.current ?? 0)) / 1000).toFixed(1)}s`);
    } catch (err) {
      setE2eStatus(`Error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
    setAppStatus("Idle");
  };

  const handleApplyPatch = async () => {
    if (!runId) return;
    const pathToUse = repoPath.trim() || configDefaultRepo;
    setApplyErrorDetails(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, repoPath: pathToUse }),
      });
      const data = await res.json();
      if (!data.ok) {
        setApplyErrorDetails(data.details || data.error || null);
        const errLine = data.details?.split(/\r?\n/)[0]?.trim();
        setE2eStatus(errLine ? `Apply failed: ${errLine}` : `Apply failed: ${data.error || "Patch could not be applied"}`);
        return;
      }
      setLastAppliedRepo(pathToUse);
      setE2eStatus("Patch applied. Verifying build...");
      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: pathToUse }),
      });
      const verifyData = await verifyRes.json();
      if (verifyData.ok && verifyData.verified) {
        setE2eStatus("Patch applied successfully. Verified.");
        setVerifyErrorDetails(null);
        setApplyCheckWarning(null);
      } else {
        setE2eStatus("Patch applied. Verification failed: Build failed.");
        setVerifyErrorDetails(verifyData.details || verifyData.error || null);
      }
    } catch (err) {
      setE2eStatus(`Apply error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handleVerify = async () => {
    const pathToUse = repoPath.trim() || configDefaultRepo;
    try {
      setE2eStatus("Verifying build...");
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoPath: pathToUse }),
      });
      const data = await res.json();
      if (data.ok && data.verified) {
        setE2eStatus("Verified.");
      } else {
        setE2eStatus(`Verification failed: ${data.error || data.details || "Build failed"}`);
      }
    } catch (err) {
      setE2eStatus(`Verify error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  const handleCreatePR = async () => {
    if (!runId) return;
    const pathToUse = repoPath.trim() || configDefaultRepo;
    try {
      setE2eStatus("Creating PR...");
      const res = await fetch("/api/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          repoPath: pathToUse,
          title: `Claude: ${instruction.trim().slice(0, 60)}${instruction.trim().length > 60 ? "..." : ""}`,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || data.details || "Create PR failed");
      if (data.prUrl) {
        setE2eStatus(`PR created: ${data.prUrl}`);
        window.open(data.prUrl, "_blank");
      } else {
        setE2eStatus(data.warning || `Branch ${data.branch} pushed. ${data.warning || ""}`);
      }
    } catch (err) {
      setE2eStatus(`Create PR error: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  };

  // Polling effect removed — all modes (scan, task, E2E) are now fully async/await.

  const displayMemories = memorySearch
    ? memories.filter(
        (m) =>
          m.text.toLowerCase().includes(memorySearch.toLowerCase()) ||
          m.tags.some((t) => t.toLowerCase().includes(memorySearch.toLowerCase()))
      )
    : memories;

  const agentIcons: Record<string, string> = {
    "Frontend Agent": "🎨",
    "Backend Agent": "⚙️",
    "Manager": "📋",
    "Reflector": "🧠",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/80 bg-gradient-to-b from-muted/40 to-background">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="space-y-4 max-w-2xl">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Powered by Claude Opus 4.6
                </Badge>
                <ModeToggle />
              </div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl lg:text-[2.5rem] text-foreground">
                Nexus
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Autonomous AI Engineering Team. One instruction → Claude routes, agents scan, Claude plans and patches → apply and verify. Real patches; learning from every run and from the web.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["Multi-agent", "Memory", "Verify", "Real patches", "Opus thinking", "Codrops"].map((label) => (
                  <Badge key={label} variant="outline" className="text-[11px] font-normal text-muted-foreground border-border/80">
                    {label}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                {["Router", "Detect", "Plan", "Patch", "Apply", "Verify"].map((step, i) => (
                  <span key={step} className="flex items-center gap-1.5">
                    <span className="font-medium text-foreground/80">{step}</span>
                    {i < 5 && <span className="opacity-50">→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <header className="sticky top-0 z-10 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6">
          <div className="flex flex-1 flex-col gap-1 md:max-w-lg">
            <label className="text-xs font-medium text-muted-foreground">Target repo</label>
            <div className="flex gap-2 items-center">
              <Input
                placeholder="e.g. /path/to/your/repo"
                value={repoPath}
                onChange={(e) => { setRepoPath(e.target.value); setRepoCheck(null); }}
                className="font-mono text-sm h-9"
              />
              <Button variant="outline" size="sm" onClick={handleCheckRepo} className="h-9 shrink-0">
                Check
              </Button>
              {repoCheck !== null && (
                <span className={`text-xs shrink-0 ${repoCheck.ok && repoCheck.isGit ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                  {repoCheck.ok && repoCheck.isGit ? "Repo found" : repoCheck.error ?? "Not found"}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSyncSources} disabled={appStatus === "Syncing"} className="h-9">
              Sync Sources
            </Button>
            <Button variant="outline" size="sm" onClick={handleScan} disabled={appStatus !== "Idle"} className="h-9">
              Scan Code
            </Button>
            <span className="hidden sm:inline-block h-4 w-px bg-border" />
            <Badge variant="secondary" className="font-mono text-xs h-7">
              {appStatus}
            </Badge>
          </div>
          {syncMessage && (
            <span className="text-sm text-muted-foreground">{syncMessage}</span>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* How it works */}
        <Card className="mb-4 border-border/80 bg-card shadow-sm">
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
              <span className="font-medium text-foreground/80">Instruction</span>
              <span className="opacity-60">→</span>
              <Badge variant="outline" className="font-mono text-[10px] border-border">Router</Badge>
              <span className="opacity-60">→</span>
              <Badge variant="outline" className="font-mono text-[10px] border-border">Detect</Badge>
              <span className="opacity-60">→</span>
              <Badge variant="outline" className="font-mono text-[10px] border-border">Plan</Badge>
              <span className="opacity-60">→</span>
              <Badge variant="outline" className="font-mono text-[10px] border-border">Patch</Badge>
              <span className="opacity-60">→</span>
              <span>Apply</span>
              <span className="opacity-60">→</span>
              <span>Verify</span>
              <span className="mx-1 opacity-40">·</span>
              <Badge variant="outline" className="font-mono text-[10px] border-border">Manager</Badge>
              <span className="opacity-60">+</span>
              <Badge variant="outline" className="font-mono text-[10px] border-border">Reflector</Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Agent cards */}
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Agent Team
            </h2>
            <p className="mb-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
              All four agents run on Claude Opus 4.6. Frontend/Backend agents scan the repo; Manager prioritizes and assigns; Reflector learns. Their output feeds Detect, Plan, and Patch on the right.
            </p>
            <p className="mb-4 text-[11px] text-muted-foreground/90">
              <strong>Every step is Claude:</strong> Eight distinct Claude calls per run. Extended thinking visible in Detect, Plan, Patch, and Manager.
            </p>
                        {artifacts?.router && (
              <p className="mb-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/90">Focus:</span>{" "}
                {artifacts.router.focusFrontend && !artifacts.router.focusBackend
                  ? "Frontend only"
                  : !artifacts.router.focusFrontend && artifacts.router.focusBackend
                    ? "Backend only"
                    : artifacts.router.focusFrontend && artifacts.router.focusBackend
                      ? "Full stack"
                      : "Custom"}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {agents.map((agent) => (
                <Card key={agent.name} className="overflow-hidden border-border/80 shadow-sm transition-shadow hover:shadow">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2.5 px-3">
                    <CardTitle className="flex flex-col gap-0 text-sm font-medium">
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm opacity-90">{agentIcons[agent.name] ?? "◆"}</span>
                        {agent.name}
                        {(AGENTS.find((a) => a.name === agent.name)?.kind === "claude") && (
                          <Badge variant="secondary" className="text-[9px] font-normal px-1.5 py-0">Claude</Badge>
                        )}
                      </span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {AGENTS.find((a) => a.name === agent.name)?.role ?? ""}
                      </span>
                    </CardTitle>
                    <Badge variant={getStatusBadgeVariant(agent.status)} className="text-[10px] shrink-0">
                      {agent.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="px-3 pb-2 space-y-1.5">
                    <ScrollArea className="h-16 rounded-md border border-border/80 bg-muted/20">
                      <div className="space-y-0.5 p-2 font-mono text-[11px] text-muted-foreground">
                        {agent.logs.map((log, i) => (
                          <div key={i} className="leading-tight">
                            {log}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    {agent.thinking && (
                      <details className="rounded-md border border-border/80 bg-muted/20">
                        <summary className="cursor-pointer px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground">
                          Extended thinking
                        </summary>
                        <ScrollArea className="h-24">
                          <pre className="whitespace-pre-wrap break-words p-2 font-mono text-[10px] text-muted-foreground leading-relaxed">
                            {agent.thinking}
                          </pre>
                        </ScrollArea>
                      </details>
                    )}
                  </CardContent>
                  <CardFooter className="py-1.5 px-3 text-[10px] text-muted-foreground">
                    {agent.lastUpdated}
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>

          {/* Instruction & Run */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Instruction & results
            </h2>
            <Tabs defaultValue="chat" className="w-full">
              <TabsList className="mb-3 grid w-full grid-cols-2 h-9">
                <TabsTrigger value="chat" className="text-xs">Instruction</TabsTrigger>
                <TabsTrigger value="memory" className="text-xs">Memory</TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="space-y-4">
                <Card className="border-border/80 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">What should the agents do?</CardTitle>
                    <p className="text-xs font-normal text-muted-foreground">
                      <strong>Scan Code</strong> — agents review your code for quality issues (no instruction needed).
                      Then <strong>Fix Issues</strong> to generate patches.<br />
                      <strong>Run with Instruction</strong> — give a task (e.g. &quot;add dark mode&quot;) and the PM routes it to the right agent.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder={configDefaultInstruction}
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      className="min-h-20 resize-none font-mono text-sm border-border/80"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        size="default"
                        variant="outline"
                        onClick={handleScan}
                        disabled={appStatus !== "Idle"}
                        className="h-9"
                      >
                        {appStatus === "E2E" && e2eStatus.toLowerCase().includes("scan") ? "Scanning…" : "Scan Code"}
                      </Button>
                      {artifacts?.frontend && artifacts?.backend && !artifacts?.patch && (
                        <Button
                          size="default"
                          onClick={handleFixIssues}
                          disabled={appStatus !== "Idle"}
                          className="font-medium h-9"
                        >
                          Fix Issues
                        </Button>
                      )}
                      <Button
                        size="default"
                        onClick={() => handleRunE2E()}
                        disabled={appStatus !== "Idle"}
                        className="font-medium h-9"
                      >
                        {appStatus === "E2E" && !e2eStatus.toLowerCase().includes("scan") ? "Running…" : "Run with Instruction"}
                      </Button>
                      <Button
                        size="default"
                        variant="outline"
                        onClick={() => {
                          setInstruction(configQuickDemoInstruction);
                          setAutoApply(true);
                          handleRunE2E({ instruction: configQuickDemoInstruction, autoApply: true });
                        }}
                        disabled={appStatus !== "Idle"}
                        className="h-9"
                      >
                        Quick Demo
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={autoApply}
                          onChange={(e) => setAutoApply(e.target.checked)}
                          className="rounded border-border"
                        />
                        Auto-apply patch
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground" title="For live demo: skip Apply and Verify so the run always finishes and you can show Plan + Patch.">
                        <input
                          type="checkbox"
                          checked={skipApplyDemo}
                          onChange={(e) => setSkipApplyDemo(e.target.checked)}
                          className="rounded border-border"
                        />
                        Skip apply (demo)
                      </label>
                    </div>
                    {(appStatus === "E2E" || e2eStatus || lastAppliedRepo) && (
                      <div className={`flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-sm ${appStatus === "E2E" ? "border-primary/30 bg-primary/5" : "border-border/80 bg-muted/30"} text-muted-foreground`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {appStatus === "E2E" && (
                            <>
                              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
                              <span className="font-medium text-foreground">Running</span>
                              <span className="text-muted-foreground">·</span>
                            </>
                          )}
                          <span className={appStatus === "E2E" ? "text-foreground" : ""}>{e2eStatus || "Starting…"}</span>
                          {e2eStatus.includes("Verified") && !e2eStatus.includes("failed") && (
                            <Badge variant="outline" className="border-green-500/60 text-green-600 dark:text-green-400 text-[10px]">
                              Verified
                            </Badge>
                          )}
                        </div>
                        {lastAppliedRepo && (
                          <div className="rounded-md border border-green-500/20 bg-green-500/5 px-2.5 py-2 text-xs text-green-800 dark:text-green-200">
                            <strong>Codebase updated.</strong> Run <code className="rounded bg-black/10 dark:bg-white/10 px-1 font-mono">npm run dev</code> in the repo or refresh the app.
                          </div>
                        )}
                        {e2eStatus.includes("Apply failed") && (
                          <details className="text-xs" open>
                            <summary className="cursor-pointer font-medium text-destructive">Why patch didn&apos;t apply</summary>
                            <p className="mt-1 text-[11px] text-muted-foreground">Run E2E again then Apply (or use Auto-apply). Don&apos;t edit the repo between run and apply. If you see &quot;corrupt patch at line N&quot;, the generated diff was malformed — see below to find that line.</p>
                            {applyErrorDetails ? (
                              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-[11px]">
                                {applyErrorDetails.slice(-2000)}
                              </pre>
                            ) : null}
                            {((artifacts?.patchPreview != null) || (artifacts?.claudePatchRaw != null)) && (
                              <div className="mt-2 space-y-2">
                                <details className="rounded border border-border/80 bg-muted/20">
                                  <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium">Debug: patch we wrote (line N = git&apos;s &quot;corrupt at line N&quot;)</summary>
                                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px] text-muted-foreground">
                                    {artifacts?.patchPreview ?? "—"}
                                  </pre>
                                </details>
                                <details className="rounded border border-border/80 bg-muted/20">
                                  <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium">Debug: Claude&apos;s raw patch output</summary>
                                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px] text-muted-foreground">
                                    {(artifacts?.claudePatchRaw ?? "—").slice(0, 4000)}
                                    {(artifacts?.claudePatchRaw?.length ?? 0) > 4000 ? "\n\n… (truncated)" : ""}
                                  </pre>
                                </details>
                              </div>
                            )}
                          </details>
                        )}
                        {e2eStatus.includes("Verification failed") && verifyErrorDetails && (
                          <details className="text-xs">
                            <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">Build error details</summary>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 font-mono text-[11px]">
                              {verifyErrorDetails.slice(-1500)}
                            </pre>
                          </details>
                        )}
                        {appStatus === "E2E" && e2eElapsed > 0 && (
                          <span className="text-xs">Elapsed: {e2eElapsed < 60 ? `${e2eElapsed}s` : `${Math.floor(e2eElapsed / 60)}m ${e2eElapsed % 60}s`}</span>
                        )}
                        {e2eStatus.includes("Patch ready") && runId && (
                          <div className="pt-2 space-y-1">
                            {applyCheckWarning && (
                              <>
                                <p className="text-[11px] text-amber-600 dark:text-amber-400">Patch may not apply cleanly. You can still try Apply.</p>
                                {((artifacts?.patchPreview != null) || (artifacts?.claudePatchRaw != null)) && (
                                  <details className="mt-1 rounded border border-amber-500/30 bg-amber-500/5 text-xs">
                                    <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium">See Claude output and patch (to fix &quot;corrupt patch&quot;)</summary>
                                    <div className="space-y-2 p-2">
                                      <details className="rounded bg-muted/30">
                                        <summary className="cursor-pointer text-[11px] font-medium">Patch we wrote (line N = git &quot;corrupt at line N&quot;)</summary>
                                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px]">{artifacts?.patchPreview ?? "—"}</pre>
                                      </details>
                                      <details className="rounded bg-muted/30">
                                        <summary className="cursor-pointer text-[11px] font-medium">Claude&apos;s raw output</summary>
                                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px]">
                                          {(artifacts?.claudePatchRaw ?? "—").slice(0, 4000)}
                                          {(artifacts?.claudePatchRaw?.length ?? 0) > 4000 ? "\n\n… (truncated)" : ""}
                                        </pre>
                                      </details>
                                    </div>
                                  </details>
                                )}
                              </>
                            )}
                            <div>
                              <Button size="sm" onClick={handleApplyPatch} className="h-8">
                                Apply Patch
                              </Button>
                              <span className="ml-2 text-xs text-muted-foreground">Apply the generated patch to your repo</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {artifacts?.claudeDetect && (
                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Claude Detect</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {artifacts.claudeDetect.issues?.length ? (
                        <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                          {artifacts.claudeDetect.issues.slice(0, 8).map((i) => (
                            <li key={i.id}>{i.title} — {i.file}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">No issues reported.</p>
                      )}
                      {artifacts.detectThinking && (
                        <details className="rounded-lg border border-border/80 bg-muted/20">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
                            Claude&apos;s reasoning (extended thinking)
                          </summary>
                          <ScrollArea className="h-40 px-3 pb-3">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                              {artifacts.detectThinking}
                            </pre>
                          </ScrollArea>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                )}

                {artifacts?.plan && (
                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Claude&apos;s Plan</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {artifacts.plan.top?.map((t) => (
                          <div key={t.taskId} className="rounded-md border border-border/80 bg-muted/20 p-2.5">
                            <p className="font-medium text-xs">{t.taskId}: {t.goal}</p>
                            {t.files?.length ? (
                              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                                {t.files.join(", ")}
                              </p>
                            ) : null}
                            {t.why ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">{t.why}</p>
                            ) : null}
                          </div>
                        ))}
                        {artifacts.plan.guardrails?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {artifacts.plan.guardrails.map((g) => (
                              <Badge key={g} variant="outline" className="text-[10px] border-border">
                                {g}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {artifacts.planThinking && (
                        <details className="mt-3 rounded-lg border border-border/80 bg-muted/20">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
                            Claude&apos;s reasoning (extended thinking)
                          </summary>
                          <ScrollArea className="h-40 px-3 pb-3">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                              {artifacts.planThinking}
                            </pre>
                          </ScrollArea>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                )}

                {artifacts?.patch && (
                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
                      <CardTitle className="text-sm font-semibold">Patch Preview</CardTitle>
                      <div className="flex gap-2">
                        {!autoApply && (
                          <Button size="sm" variant="outline" onClick={handleApplyPatch} className="h-8 text-xs">
                            Apply Patch
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={handleVerify} className="h-8 text-xs">
                          Verify
                        </Button>
                        <Button size="sm" variant="secondary" onClick={handleCreatePR} className="h-8 text-xs">
                          Create PR
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <ScrollArea className="h-56 rounded-lg border border-border/80 bg-muted/20 p-3">
                        <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
                          {artifacts.patch}
                        </pre>
                      </ScrollArea>
                      {artifacts.patchThinking && (
                        <details className="rounded-lg border border-border/80 bg-muted/20">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
                            Claude&apos;s reasoning (extended thinking)
                          </summary>
                          <ScrollArea className="h-40 px-3 pb-3">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                              {artifacts.patchThinking}
                            </pre>
                          </ScrollArea>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="memory" className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Search memories..."
                    value={memorySearch}
                    onChange={(e) => setMemorySearch(e.target.value)}
                    className="flex-1 min-w-[200px] h-9 text-sm border-border/80"
                  />
                  <Button variant="outline" size="sm" onClick={handleSyncCodrops} disabled={codropsSyncing} className="h-9">
                    {codropsSyncing ? "Reading article…" : "Sync from Codrops"}
                  </Button>
                </div>
                {codropsSyncing && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Reflector is reading the latest Codrops article and extracting techniques…
                  </div>
                )}
                {codropsMessage && !codropsSyncing && (
                  <p className="text-xs text-muted-foreground">{codropsMessage}</p>
                )}
                <Card className="border-border/80 shadow-sm">
                  <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3 p-4">
                        {displayMemories.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No memories yet. Run End-to-End, Sync Sources, or Sync from Codrops.
                          </p>
                        ) : (
                          displayMemories.map((m) => (
                            <div key={m.id} className="space-y-2 rounded-lg border border-border/80 p-3 bg-card">
                              <p className="text-xs">{m.text}</p>
                              <div className="flex flex-wrap gap-1">
                                {m.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-[10px]">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </section>
        </div>

        {/* Latest run summary */}
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Latest Run
          </h2>
          <p className="mb-3 text-[11px] text-muted-foreground">Most recent E2E: Router → scan → Manager → Detect → Plan → Patch → Apply. Shows Manager&apos;s assignment and duration.</p>
          <Card className="border-border/80 shadow-sm">
            <CardContent className="pt-5 pb-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <p className="font-mono text-xs text-muted-foreground">
                    {runId ?? "—"} · {runDuration}
                  </p>
                  {artifacts?.manager?.top && artifacts.manager.top.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] font-medium text-muted-foreground">Prioritized & assigned by Claude (Manager)</p>
                      <ul className="list-inside list-disc text-[11px] text-muted-foreground">
                        {artifacts.manager.top.slice(0, 5).map((t) => (
                          <li key={t.id}>
                            {t.id}: {t.reason}
                            {t.agent ? (
                              <span className="ml-1 text-foreground/80">→ {t.agent === "frontend" ? "Frontend" : "Backend"}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {artifacts.managerThinking && (
                        <details className="mt-2 rounded-lg border border-border/80 bg-muted/20">
                          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-foreground">
                            Claude&apos;s reasoning (Manager)
                          </summary>
                          <ScrollArea className="h-32 px-2 pb-2">
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                              {artifacts.managerThinking}
                            </pre>
                          </ScrollArea>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
