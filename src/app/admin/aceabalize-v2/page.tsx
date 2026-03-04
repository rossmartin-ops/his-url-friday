'use client';

import { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';

type Phase = 'process' | 'enhance' | 'polish' | 'book-ends';

interface JobStatus {
  jobId: string;
  sessionId: string;
  phase: string;
  status: string;
  progress: number;
  messages: string[];
  errors: string[];
  currentChunk?: number;
  totalChunks?: number;
}

interface JobResult {
  content: string | null;
}

interface Session {
  sessionId: string;
  originalFileName: string;
  createdAt: string;
  jobs: { phase: string; status: string; progress: number }[];
}

interface SessionsResponse {
  sessions: Session[];
}

interface SubmitResponse {
  jobId: string;
  sessionId: string;
}

interface PipelineSubmitResponse {
  sessionId: string;
  jobs: { process: string; enhance: string; polish: string; bookEnds: string };
}

const PHASES: { id: Phase; label: string; description: string }[] = [
  { id: 'process', label: 'Process', description: 'Transform SME notes → aceabalized content' },
  { id: 'enhance', label: 'Enhance', description: 'Improve tone and engagement' },
  { id: 'polish', label: 'Polish', description: 'Final grammar and formatting' },
  { id: 'book-ends', label: 'Book Ends', description: 'Generate intro, summary, title-case headers' },
];

const PIPELINE_PHASES = ['process', 'enhance', 'polish', 'book_ends'] as const;

function statusColor(status: string) {
  if (status === 'done') return 'text-green-600';
  if (status === 'running') return 'text-primary';
  if (status === 'error') return 'text-destructive';
  if (status === 'canceled') return 'text-muted-foreground';
  return 'text-muted-foreground';
}

function downloadMarkdown(content: string, fileName: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AceabalizeV2Page() {
  const [activePhase, setActivePhase] = useState<Phase>('process');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [sessionId, setSessionId] = useState('');

  // Single-phase state
  const [job, setJob] = useState<JobStatus | null>(null);
  const [artifact, setArtifact] = useState('');

  // Full pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [, setPipelineJobs] = useState<Record<string, string>>({});
  const [pipelineStatuses, setPipelineStatuses] = useState<Record<string, string>>({});
  const [pipelineOutput, setPipelineOutput] = useState('');
  const [pipelineDone, setPipelineDone] = useState(false);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pipelinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetchSessions();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
    };
  }, []);

  async function fetchSessions() {
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/aceabalize-v2/sessions');
      const data = (await res.json()) as SessionsResponse;
      setSessions(data.sessions);
    } finally {
      setLoadingSessions(false);
    }
  }

  // ── Single-phase polling ──────────────────────────────────────────────────
  function startPolling(jobId: string, phase: Phase) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/aceabalize-v2/${phase}/status/${jobId}`);
        const data = (await res.json()) as JobStatus;
        setJob(data);

        if (data.status === 'done') {
          if (pollRef.current) clearInterval(pollRef.current);
          const resArt = await fetch(`/api/aceabalize-v2/${phase}/result/${jobId}`);
          const artData = (await resArt.json()) as JobResult;
          setArtifact(artData.content ?? '');
          void fetchSessions();
        } else if (data.status === 'error' || data.status === 'canceled') {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      })();
    }, 2000);
  }

  async function handleSubmit() {
    setError('');
    setJob(null);
    setArtifact('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/aceabalize-v2/${activePhase}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content || undefined,
          sessionId: sessionId || undefined,
          originalFileName: fileName || 'untitled',
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      const data = (await res.json()) as SubmitResponse;
      setSessionId(data.sessionId);
      setJob({ jobId: data.jobId, sessionId: data.sessionId, phase: activePhase, status: 'pending', progress: 0, messages: [], errors: [] });
      startPolling(data.jobId, activePhase);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!job) return;
    await fetch(`/api/aceabalize-v2/${activePhase}/cancel/${job.jobId}`, { method: 'POST' });
    setJob((j) => j ? { ...j, status: 'canceled' } : j);
    if (pollRef.current) clearInterval(pollRef.current);
  }

  // ── Full pipeline ─────────────────────────────────────────────────────────
  async function handleRunPipeline() {
    if (!content.trim()) return;
    setError('');
    setPipelineOutput('');
    setPipelineDone(false);
    setPipelineStatuses({});
    setPipelineRunning(true);

    try {
      const res = await fetch('/api/aceabalize-v2/pipeline/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          originalFileName: fileName || 'untitled',
          sessionId: sessionId || undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      const data = (await res.json()) as PipelineSubmitResponse;
      setSessionId(data.sessionId);
      setPipelineJobs({
        process: data.jobs.process,
        enhance: data.jobs.enhance,
        polish: data.jobs.polish,
        book_ends: data.jobs.bookEnds,
      });
      startPipelinePolling(data.sessionId, data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPipelineRunning(false);
    }
  }

  function startPipelinePolling(
    sid: string,
    jobs: { process: string; enhance: string; polish: string; bookEnds: string }
  ) {
    if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);

    const jobMap: Record<string, string> = {
      process: jobs.process,
      enhance: jobs.enhance,
      polish: jobs.polish,
      book_ends: jobs.bookEnds,
    };

    pipelinePollRef.current = setInterval(() => {
      void (async () => {
        const results = await Promise.all(
          PIPELINE_PHASES.map(async (phase) => {
            const jid = jobMap[phase];
            if (!jid) return { phase, status: 'pending', progress: 0 };
            const r = await fetch(`/api/aceabalize-v2/${phase === 'book_ends' ? 'book-ends' : phase}/status/${jid}`);
            const statusData = (await r.json()) as JobStatus;
            return { phase, status: statusData.status, progress: statusData.progress };
          })
        );

        const statusMap: Record<string, string> = {};
        results.forEach((r) => { statusMap[r.phase] = r.status; });
        setPipelineStatuses(statusMap);

        const allDone = results.every((r) => r.status === 'done' || r.status === 'error' || r.status === 'canceled');
        const anyError = results.some((r) => r.status === 'error');

        if (allDone) {
          if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
          setPipelineRunning(false);
          setPipelineDone(!anyError);
          void fetchSessions();

          if (!anyError) {
            // Fetch the final artifact
            const finalRes = await fetch(`/api/aceabalize-v2/sessions/${sid}/artifacts/final_md`);
            if (finalRes.ok) {
              const finalData = (await finalRes.json()) as { content: string | null };
              setPipelineOutput(finalData.content ?? '');
            }
          }
        }
      })();
    }, 3000);
  }

  function loadSession(s: Session) {
    setSessionId(s.sessionId);
    setFileName(s.originalFileName);
    setJob(null);
    setArtifact('');
    setError('');
    setPipelineOutput('');
    setPipelineDone(false);
  }

  const isRunning = job?.status === 'running' || job?.status === 'pending';

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Session sidebar */}
      <aside className="w-64 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Sessions</h2>
          <button onClick={() => { void fetchSessions(); }} className="text-xs text-primary hover:underline">
            Refresh
          </button>
        </div>
        {loadingSessions && <p className="text-xs text-muted-foreground">Loading…</p>}
        <div className="flex flex-col gap-2 overflow-y-auto">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => loadSession(s)}
              className={`text-left rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors ${
                s.sessionId === sessionId ? 'border-primary bg-muted' : 'border-border'
              }`}
            >
              <p className="font-medium truncate">{s.originalFileName || 'untitled'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.jobs.length} job(s) · {new Date(s.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
          {sessions.length === 0 && !loadingSessions && (
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-5 min-w-0">
        <div>
          <h1 className="text-2xl font-bold">Aceabalize V2</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Transform SME notes into Aceable-voice course content
          </p>
        </div>

        {/* Inputs */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="File name (optional)"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
          />
          <input
            type="text"
            placeholder="Session ID (leave blank for new)"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="flex-1 border rounded-md px-3 py-2 text-sm bg-background font-mono text-xs"
          />
        </div>

        <textarea
          placeholder="Paste SME notes / content here…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background font-mono resize-y"
        />

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* ── Run Full Pipeline (primary action) ─────────────────────────── */}
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">Run Full Pipeline</p>
              <p className="text-xs text-muted-foreground">Runs all 4 phases automatically in sequence</p>
            </div>
            <button
              onClick={() => { void handleRunPipeline(); }}
              disabled={pipelineRunning || !content.trim()}
              className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {pipelineRunning ? 'Running…' : 'Run Full Pipeline'}
            </button>
          </div>

          {/* Pipeline phase status */}
          {(pipelineRunning || pipelineDone || Object.keys(pipelineStatuses).length > 0) && (
            <div className="grid grid-cols-4 gap-2">
              {PIPELINE_PHASES.map((phase, i) => {
                const status = pipelineStatuses[phase] ?? 'pending';
                const labels = ['Process', 'Enhance', 'Polish', 'Book Ends'];
                return (
                  <div key={phase} className="rounded-md border bg-background p-2.5 text-center">
                    <p className="text-xs font-medium text-muted-foreground">{i + 1}. {labels[i]}</p>
                    <p className={`text-xs font-semibold mt-1 ${statusColor(status)}`}>{status}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Final output */}
          {pipelineDone && pipelineOutput && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-green-600">Pipeline complete</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { void navigator.clipboard.writeText(pipelineOutput); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => downloadMarkdown(pipelineOutput, fileName || 'output')}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Download className="h-3 w-3" /> Download .md
                  </button>
                </div>
              </div>
              <textarea
                value={pipelineOutput}
                readOnly
                rows={20}
                className="w-full border rounded-md px-3 py-2 text-sm bg-muted font-mono resize-y"
              />
            </div>
          )}
        </div>

        {/* ── Individual phases (advanced) ───────────────────────────────── */}
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            Run individual phase (advanced)
          </summary>

          <div className="mt-3 space-y-3 pl-4 border-l-2 border-border">
            <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
              {PHASES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePhase(p.id)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activePhase === p.id
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {PHASES.find((p) => p.id === activePhase)?.description}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { void handleSubmit(); }}
                disabled={submitting || isRunning || (activePhase === 'process' && !content.trim())}
                className="px-4 py-1.5 rounded-md bg-muted border text-sm font-medium disabled:opacity-50 hover:bg-muted/80 transition-colors"
              >
                {submitting ? 'Submitting…' : `Run ${PHASES.find((p) => p.id === activePhase)?.label}`}
              </button>
              {isRunning && (
                <button
                  onClick={() => { void handleCancel(); }}
                  className="px-4 py-1.5 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {job && (
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">
                    Status: <span className={statusColor(job.status)}>{job.status}</span>
                  </span>
                  <span className="text-xs text-muted-foreground font-mono">{job.jobId.slice(0, 8)}</span>
                </div>
                {(job.status === 'running' || job.status === 'done') && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                )}
                {job.messages.length > 0 && (
                  <div className="bg-muted rounded-md p-2 max-h-24 overflow-y-auto">
                    {job.messages.map((m, i) => (
                      <p key={i} className="text-xs font-mono text-muted-foreground">{m}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {artifact && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Output</p>
                  <div className="flex gap-2">
                    <button onClick={() => { void navigator.clipboard.writeText(artifact); }} className="text-xs text-primary hover:underline">Copy</button>
                    <button onClick={() => downloadMarkdown(artifact, `${fileName || 'output'}-${activePhase}`)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                      <Download className="h-3 w-3" /> Download
                    </button>
                  </div>
                </div>
                <textarea value={artifact} readOnly rows={16} className="w-full border rounded-md px-3 py-2 text-sm bg-muted font-mono resize-y" />
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
