'use client';

import { useState, useEffect } from 'react';

interface Session {
  sessionId: string;
  originalFileName: string;
  createdAt: string;
  jobs: { status: string }[];
}

interface SessionsResponse {
  sessions: Session[];
}

interface Metrics {
  length: number;
  words: number;
  lines: number;
  paragraphs: number;
  sentences: number;
}

interface EvalResult {
  completeness: number;
  accuracy: number;
  clarity: number;
  educational_value: number;
  structure: number;
  overall: number;
  summary: string;
}

interface CompareResult {
  session_a: { id: string; fileName: string; createdAt: string };
  session_b: { id: string; fileName: string; createdAt: string };
  metrics: {
    lengthDiffPct: number;
    a: Metrics;
    b: Metrics;
  };
  ai_evaluations: {
    anthropic: EvalResult | null;
    openai: EvalResult | null;
  };
  content_a: string;
  content_b: string;
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-full h-1.5">
        <div className="bg-primary h-1.5 rounded-full" style={{ width: `${score * 10}%` }} />
      </div>
      <span className="text-xs w-6 text-right">{score}</span>
    </div>
  );
}

function EvalCard({ title, eval: evalData }: { title: string; eval: EvalResult | null }) {
  if (!evalData) return (
    <div className="rounded-lg border p-4 space-y-2">
      <h4 className="font-medium text-sm">{title}</h4>
      <p className="text-xs text-muted-foreground">Evaluation not available</p>
    </div>
  );

  const scores = [
    { label: 'Completeness', value: evalData.completeness },
    { label: 'Accuracy', value: evalData.accuracy },
    { label: 'Clarity', value: evalData.clarity },
    { label: 'Educational Value', value: evalData.educational_value },
    { label: 'Structure', value: evalData.structure },
  ];

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{title}</h4>
        <span className="text-2xl font-bold text-primary">{evalData.overall}/10</span>
      </div>
      <p className="text-xs text-muted-foreground">{evalData.summary}</p>
      <div className="space-y-1.5">
        {scores.map((s) => (
          <div key={s.label} className="grid grid-cols-[140px_1fr] items-center gap-2">
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <ScoreBar score={s.value} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SessionComparisonPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionA, setSessionA] = useState('');
  const [sessionB, setSessionB] = useState('');
  const [skipAi, setSkipAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'scores' | 'diff'>('scores');

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/aceabalize-v2/sessions');
      const data = (await res.json()) as SessionsResponse;
      setSessions(data.sessions);
    })();
  }, []);

  async function handleCompare() {
    if (!sessionA || !sessionB) return;
    setError('');
    setResult(null);
    setLoading(true);

    try {
      const params = new URLSearchParams({ a: sessionA, b: sessionB, skipAi: String(skipAi) });
      const res = await fetch(`/api/aceabalize-v2/sessions/compare?${params}`);
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      setResult((await res.json()) as CompareResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const doneSessions = sessions.filter((s) => s.jobs.some((j) => j.status === 'done'));

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Session Comparison</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare two Aceabalize sessions with AI-powered quality scoring
        </p>
      </div>

      {/* Pickers */}
      <div className="grid grid-cols-2 gap-4">
        {([
          { label: 'Session A', value: sessionA, set: setSessionA },
          { label: 'Session B', value: sessionB, set: setSessionB },
        ] as const).map(({ label, value, set }) => (
          <div key={label} className="space-y-1.5">
            <label className="text-sm font-medium">{label}</label>
            <select
              value={value}
              onChange={(e) => set(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">— select session —</option>
              {doneSessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.originalFileName || 'untitled'} · {new Date(s.createdAt).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={skipAi}
            onChange={(e) => setSkipAi(e.target.checked)}
            className="rounded"
          />
          Skip AI evaluation (faster, metrics only)
        </label>
        <button
          onClick={() => { void handleCompare(); }}
          disabled={!sessionA || !sessionB || loading}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold">{result.metrics.lengthDiffPct}%</p>
              <p className="text-xs text-muted-foreground mt-1">Length difference</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Session A</p>
              <p className="text-sm">{result.metrics.a.words.toLocaleString()} words</p>
              <p className="text-xs text-muted-foreground">{result.metrics.a.paragraphs} paragraphs</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium mb-2 text-muted-foreground">Session B</p>
              <p className="text-sm">{result.metrics.b.words.toLocaleString()} words</p>
              <p className="text-xs text-muted-foreground">{result.metrics.b.paragraphs} paragraphs</p>
            </div>
          </div>

          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            {(['scores', 'diff'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  activeTab === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
                }`}
              >
                {tab === 'scores' ? 'AI Scores' : 'Content Diff'}
              </button>
            ))}
          </div>

          {activeTab === 'scores' && (
            <div className="grid grid-cols-2 gap-4">
              <EvalCard title="Anthropic (Claude)" eval={result.ai_evaluations.anthropic} />
              <EvalCard title="OpenAI (GPT-4o)" eval={result.ai_evaluations.openai} />
            </div>
          )}

          {activeTab === 'diff' && (
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: `Session A — ${result.session_a.fileName}`, content: result.content_a },
                { label: `Session B — ${result.session_b.fileName}`, content: result.content_b },
              ].map(({ label, content }) => (
                <div key={label} className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
                  <textarea
                    value={content}
                    readOnly
                    rows={30}
                    className="w-full border rounded-md px-3 py-2 text-xs bg-muted font-mono resize-y"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
