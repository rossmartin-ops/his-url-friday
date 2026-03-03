'use client';

import { useState, useEffect, useRef } from 'react';

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
  completedAt?: string;
  durationSeconds?: number;
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

const PHASES: { id: Phase; label: string; description: string }[] = [
  { id: 'process', label: 'Process', description: 'Transform SME notes → aceabalized content' },
  { id: 'enhance', label: 'Enhance', description: 'Improve tone and engagement' },
  { id: 'polish', label: 'Polish', description: 'Final grammar and formatting' },
  { id: 'book-ends', label: 'Book Ends', description: 'Generate intro, summary, title-case headers' },
];

export default function AceabalizeV2Page() {
  const [activePhase, setActivePhase] = useState<Phase>('process');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [job, setJob] = useState<JobStatus | null>(null);
  const [artifact, setArtifact] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetchSessions();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
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

  function loadSession(s: Session) {
    setSessionId(s.sessionId);
    setFileName(s.originalFileName);
    setJob(null);
    setArtifact('');
    setError('');
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

        {/* Phase tabs */}
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

        <p className="text-sm text-muted-foreground -mt-2">
          {PHASES.find((p) => p.id === activePhase)?.description}
        </p>

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

        {(activePhase === 'process' || !sessionId) && (
          <textarea
            placeholder="Paste SME notes / content here…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background font-mono resize-y"
          />
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => { void handleSubmit(); }}
            disabled={submitting || isRunning || (activePhase === 'process' && !content.trim())}
            className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {submitting ? 'Submitting…' : `Run ${PHASES.find((p) => p.id === activePhase)?.label}`}
          </button>
          {isRunning && (
            <button
              onClick={() => { void handleCancel(); }}
              className="px-5 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Job status */}
        {job && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">
                Job status:{' '}
                <span className={
                  job.status === 'done' ? 'text-green-600' :
                  job.status === 'error' ? 'text-destructive' :
                  job.status === 'canceled' ? 'text-muted-foreground' :
                  'text-primary'
                }>
                  {job.status}
                </span>
              </span>
              <span className="text-xs text-muted-foreground font-mono">{job.jobId.slice(0, 8)}</span>
            </div>

            {(job.status === 'running' || job.status === 'done') && (
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}

            {job.totalChunks && job.totalChunks > 1 && (
              <p className="text-xs text-muted-foreground">
                Chunk {job.currentChunk ?? 0} / {job.totalChunks}
              </p>
            )}

            {job.messages.length > 0 && (
              <div className="bg-muted rounded-md p-3 max-h-32 overflow-y-auto">
                {job.messages.map((m, i) => (
                  <p key={i} className="text-xs font-mono text-muted-foreground">{m}</p>
                ))}
              </div>
            )}

            {job.errors.length > 0 && (
              <div className="bg-destructive/10 rounded-md p-3">
                {job.errors.map((e, i) => (
                  <p key={i} className="text-xs font-mono text-destructive">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Artifact output */}
        {artifact && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">Output</h3>
              <button
                onClick={() => { void navigator.clipboard.writeText(artifact); }}
                className="text-xs text-primary hover:underline"
              >
                Copy
              </button>
            </div>
            <textarea
              value={artifact}
              readOnly
              rows={20}
              className="w-full border rounded-md px-3 py-2 text-sm bg-muted font-mono resize-y"
            />
          </div>
        )}
      </div>
    </div>
  );
}
