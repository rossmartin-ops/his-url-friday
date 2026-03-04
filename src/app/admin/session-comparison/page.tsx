'use client';

import { useState, useEffect } from 'react';

interface Session {
  sessionId: string;
  originalFileName: string;
  createdAt: string;
  jobs: { status: string }[];
}

interface DimensionScores {
  voice_tone: number;
  instructional_design: number;
  content_quality: number;
  formatting: number;
}

interface EvalResult {
  scores: { a: DimensionScores; b: DimensionScores };
  overall: { a: number; b: number };
  winner: 'A' | 'B' | 'Tie';
  summary: string;
  a_strengths: string[];
  a_weaknesses: string[];
  b_strengths: string[];
  b_weaknesses: string[];
  recommendation: string;
  provider: string;
}

interface ContentMetrics {
  length: number;
  words: number;
  contractions: number;
  context_hooks: number;
  bolded_terms: number;
  paragraphs: number;
}

interface CompareResult {
  session_a: { id: string; fileName: string; createdAt: string };
  session_b: { id: string; fileName: string; createdAt: string };
  metrics: { lengthDiffPct: number; a: ContentMetrics; b: ContentMetrics };
  ai_evaluations: { anthropic: EvalResult | null; openai: EvalResult | null };
  content_a: string;
  content_b: string;
}

const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  voice_tone: 'Voice & Tone',
  instructional_design: 'Instructional Design',
  content_quality: 'Content Quality',
  formatting: 'Formatting',
};

const DIMENSION_WEIGHTS: Record<keyof DimensionScores, string> = {
  voice_tone: '30%',
  instructional_design: '25%',
  content_quality: '30%',
  formatting: '15%',
};

function ScoreBar({ a, b }: { a: number; b: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-6 text-right font-semibold text-[#12BDCD]">{a}</span>
      <div className="flex-1 bg-muted rounded-full h-1.5 relative">
        <div className="absolute left-0 top-0 h-1.5 rounded-full bg-[#12BDCD]/70 transition-all" style={{ width: `${a * 10}%` }} />
      </div>
      <div className="flex-1 bg-muted rounded-full h-1.5 relative">
        <div className="absolute left-0 top-0 h-1.5 rounded-full bg-[#141F26]/60 transition-all" style={{ width: `${b * 10}%` }} />
      </div>
      <span className="w-6 font-semibold text-[#141F26]/80">{b}</span>
    </div>
  );
}

function WinnerBadge({ winner, provider }: { winner: 'A' | 'B' | 'Tie'; provider: string }) {
  const colors = {
    A: 'bg-[#12BDCD] text-white',
    B: 'bg-[#141F26] text-white',
    Tie: 'bg-muted text-foreground',
  };
  return (
    <div className={`rounded-lg px-4 py-2 text-center ${colors[winner]}`}>
      <p className="text-xs opacity-75">{provider} says</p>
      <p className="font-bold">{winner === 'Tie' ? "It's a Tie" : `Session ${winner} Wins`}</p>
    </div>
  );
}

function EvalSection({ label, eval: evalData }: { label: string; eval: EvalResult }) {
  const dims = Object.keys(DIMENSION_LABELS) as (keyof DimensionScores)[];

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
        <h3 className="font-semibold text-sm">{label}</h3>
        <WinnerBadge winner={evalData.winner} provider={label} />
      </div>

      <div className="p-5 space-y-4">
        {/* Overall scores */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#12BDCD]/30 bg-[#12BDCD]/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Session A Overall</p>
            <p className="text-3xl font-bold text-[#12BDCD]">{evalData.overall.a.toFixed(1)}</p>
          </div>
          <div className="rounded-lg border border-[#141F26]/20 bg-[#141F26]/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Session B Overall</p>
            <p className="text-3xl font-bold text-[#141F26]/80">{evalData.overall.b.toFixed(1)}</p>
          </div>
        </div>

        {/* Summary */}
        <p className="text-sm text-muted-foreground italic">{evalData.summary}</p>

        {/* Dimension scores */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_6px_auto_auto_6px] gap-x-2 items-center pb-1">
            <p className="text-xs font-medium text-muted-foreground">Dimension</p>
            <span />
            <p className="text-xs font-semibold text-[#12BDCD] text-right w-20">A ←</p>
            <p className="text-xs font-semibold text-[#141F26]/80 w-20">→ B</p>
            <span />
          </div>
          {dims.map((dim) => (
            <div key={dim} className="grid grid-cols-[140px_1fr] items-center gap-3">
              <div>
                <span className="text-xs font-medium">{DIMENSION_LABELS[dim]}</span>
                <span className="text-xs text-muted-foreground ml-1">({DIMENSION_WEIGHTS[dim]})</span>
              </div>
              <ScoreBar a={evalData.scores.a[dim]} b={evalData.scores.b[dim]} />
            </div>
          ))}
        </div>

        {/* Strengths & weaknesses */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { title: 'A Strengths', items: evalData.a_strengths, color: 'border-[#12BDCD]/30 bg-[#12BDCD]/5' },
            { title: 'B Strengths', items: evalData.b_strengths, color: 'border-[#141F26]/20 bg-[#141F26]/5' },
            { title: 'A Weaknesses', items: evalData.a_weaknesses, color: 'border-red-200 bg-red-50/40' },
            { title: 'B Weaknesses', items: evalData.b_weaknesses, color: 'border-red-200 bg-red-50/40' },
          ].map(({ title, items, color }) => (
            <div key={title} className={`rounded-lg border p-3 ${color}`}>
              <p className="text-xs font-semibold mb-1.5">{title}</p>
              <ul className="space-y-0.5">
                {items.map((item, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                    <span className="mt-0.5 shrink-0">•</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Recommendation */}
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs font-semibold text-blue-800 mb-1">Recommendation</p>
          <p className="text-sm text-blue-900">{evalData.recommendation}</p>
        </div>
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
      const data = (await res.json()) as { sessions: Session[] };
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
      if (!res.ok) throw new Error(((await res.json()) as { error: string }).error);
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
          Compare two Aceabalize sessions with dual AI evaluation (Claude + GPT)
        </p>
      </div>

      {/* Session pickers */}
      <div className="grid grid-cols-2 gap-4">
        {([
          { label: 'Session A', value: sessionA, set: setSessionA, color: 'text-[#12BDCD]' },
          { label: 'Session B', value: sessionB, set: setSessionB, color: 'text-[#141F26]' },
        ] as const).map(({ label, value, set, color }) => (
          <div key={label} className="space-y-1.5">
            <label className={`text-sm font-semibold ${color}`}>{label}</label>
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
          <input type="checkbox" checked={skipAi} onChange={(e) => setSkipAi(e.target.checked)} />
          Skip AI evaluation (metrics only)
        </label>
        <button
          onClick={() => { void handleCompare(); }}
          disabled={!sessionA || !sessionB || loading}
          className="px-5 py-2 rounded-md bg-[#12BDCD] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#0fa8b8] transition-colors"
        >
          {loading ? 'Comparing… (30–60s)' : 'Compare'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Aceable-specific metrics */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-sm">Content Metrics</h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Length diff', value: `${result.metrics.lengthDiffPct}%`, sub: '' },
                  { label: 'Words', value: `${result.metrics.a.words.toLocaleString()} / ${result.metrics.b.words.toLocaleString()}`, sub: 'A / B' },
                  { label: 'Contractions', value: `${result.metrics.a.contractions} / ${result.metrics.b.contractions}`, sub: 'conversational tone' },
                  { label: 'Context hooks', value: `${result.metrics.a.context_hooks} / ${result.metrics.b.context_hooks}`, sub: 'engagement phrases' },
                  { label: 'Bolded terms', value: `${result.metrics.a.bolded_terms} / ${result.metrics.b.bolded_terms}`, sub: 'A / B' },
                ].map(({ label, value, sub }) => (
                  <div key={label} className="rounded-lg border border-border p-3 text-center">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-semibold text-sm mt-1">{value}</p>
                    {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
            {(['scores', 'diff'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab ? 'bg-background shadow text-foreground' : 'text-muted-foreground'
                }`}
              >
                {tab === 'scores' ? 'AI Evaluation' : 'Content Diff'}
              </button>
            ))}
          </div>

          {activeTab === 'scores' && (
            <div className="space-y-5">
              {result.ai_evaluations.anthropic && (
                <EvalSection label="Claude (Anthropic)" eval={result.ai_evaluations.anthropic} />
              )}
              {result.ai_evaluations.openai && (
                <EvalSection label="GPT-4o (OpenAI)" eval={result.ai_evaluations.openai} />
              )}
              {!result.ai_evaluations.anthropic && !result.ai_evaluations.openai && (
                <p className="text-sm text-muted-foreground">AI evaluation skipped or unavailable.</p>
              )}
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
