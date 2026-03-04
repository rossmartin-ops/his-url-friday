'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Download, FileUp, Settings, ClipboardCheck, X, History, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ── Prompt editor types ────────────────────────────────────────────────────

interface Prompt {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  activeVersion: number | null;
  updatedAt: string;
}

interface PromptDetail extends Prompt {
  content: string;
}

interface PromptVersion {
  id: number;
  version: number;
  content: string;
  changeNote: string | null;
  createdBy: string | null;
  createdAt: string;
  isArchived: boolean | null;
}

interface PromptsListResponse { prompts: Prompt[] }
interface PromptDetailResponse { prompt: PromptDetail }
interface PromptHistoryResponse { slug: string; versions: PromptVersion[] }

// ── Prompt editor modal ────────────────────────────────────────────────────

function PromptEditorModal({ onClose }: { onClose: () => void }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [promptDetail, setPromptDetail] = useState<PromptDetail | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<PromptVersion[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/aceabalize-v2/prompts');
      const data = (await res.json()) as PromptsListResponse;
      setPrompts(data.prompts);
      if (data.prompts[0]) void selectPrompt(data.prompts[0].slug);
    })();
   
  }, []);

  async function selectPrompt(slug: string) {
    setSelectedSlug(slug);
    setShowHistory(false);
    setChangeNote('');
    setSaveMsg('');
    const res = await fetch(`/api/aceabalize-v2/prompts/${slug}`);
    const data = (await res.json()) as PromptDetailResponse;
    setPromptDetail(data.prompt);
    setEditedContent(data.prompt.content);
  }

  async function handleSave() {
    if (!selectedSlug || !changeNote.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/aceabalize-v2/prompts/${selectedSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedContent, changeNote }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveMsg('Saved successfully');
      setChangeNote('');
      // Refresh the prompt detail and list
      void selectPrompt(selectedSlug);
      const listRes = await fetch('/api/aceabalize-v2/prompts');
      const listData = (await listRes.json()) as PromptsListResponse;
      setPrompts(listData.prompts);
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function loadHistory() {
    if (!selectedSlug) return;
    setLoadingHistory(true);
    setShowHistory(true);
    const res = await fetch(`/api/aceabalize-v2/prompts/${selectedSlug}/history`);
    const data = (await res.json()) as PromptHistoryResponse;
    setHistory(data.versions);
    setLoadingHistory(false);
  }

  async function revertToVersion(version: number) {
    if (!selectedSlug) return;
    await fetch(`/api/aceabalize-v2/prompts/${selectedSlug}/revert/${String(version)}`, { method: 'POST' });
    setShowHistory(false);
    void selectPrompt(selectedSlug);
  }

  const isDirty = promptDetail && editedContent !== promptDetail.content;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-background rounded-xl border border-border w-full max-w-4xl h-[85vh] flex overflow-hidden shadow-xl">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold">Prompts</span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {prompts.map((p) => (
              <button
                key={p.slug}
                onClick={() => { void selectPrompt(p.slug); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors ${
                  selectedSlug === p.slug ? 'bg-[#12BDCD]/10 border-l-2 border-l-[#12BDCD] font-medium' : ''
                }`}
              >
                <p className="truncate">{p.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">v{p.activeVersion ?? 1}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {promptDetail ? (
            <>
              <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{promptDetail.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{promptDetail.description}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => { void loadHistory(); }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1"
                  >
                    <History className="h-3 w-3" /> History
                  </button>
                </div>
              </div>

              {showHistory ? (
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Version History</p>
                    <button onClick={() => setShowHistory(false)} className="text-xs text-[#12BDCD] hover:underline">
                      ← Back to editor
                    </button>
                  </div>
                  {loadingHistory && <p className="text-sm text-muted-foreground">Loading…</p>}
                  {history.map((v) => (
                    <div key={v.id} className="rounded-lg border border-border p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold">v{v.version}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                          <button
                            onClick={() => { void revertToVersion(v.version); }}
                            className="text-xs text-[#12BDCD] hover:underline"
                          >
                            Revert
                          </button>
                        </div>
                      </div>
                      {v.changeNote && <p className="text-xs text-muted-foreground">{v.changeNote}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex-1 p-5 flex flex-col gap-3 min-h-0">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm font-mono bg-background resize-none focus:outline-none focus:ring-1 focus:ring-[#12BDCD]"
                    />
                  </div>

                  {isDirty && (
                    <div className="px-5 py-3 border-t border-border flex gap-3 items-center">
                      <input
                        type="text"
                        placeholder="Change note (required to save)…"
                        value={changeNote}
                        onChange={(e) => setChangeNote(e.target.value)}
                        className="flex-1 border border-border rounded-md px-3 py-1.5 text-sm bg-background"
                      />
                      <button
                        onClick={() => { void handleSave(); }}
                        disabled={saving || !changeNote.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#12BDCD] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#0fa8b8] transition-colors"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      {saveMsg && <p className={`text-xs ${saveMsg.includes('fail') ? 'text-destructive' : 'text-green-600'}`}>{saveMsg}</p>}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a prompt from the sidebar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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

interface Session {
  sessionId: string;
  originalFileName: string;
  createdAt: string;
  jobs: { phase: string; status: string; progress: number }[];
}

interface SessionsResponse {
  sessions: Session[];
}

interface PipelineSubmitResponse {
  sessionId: string;
  jobs: { process: string; enhance: string; polish: string; bookEnds: string };
}

interface ArtifactResponse {
  content: string | null;
}

const PIPELINE_PHASES = ['process', 'enhance', 'polish', 'book_ends'] as const;
const PHASE_LABELS: Record<string, string> = {
  process: 'Process',
  enhance: 'Enhance',
  polish: 'Polish',
  book_ends: 'Book Ends',
};

function statusColor(status: string) {
  if (status === 'done') return 'text-green-600';
  if (status === 'running') return 'text-blue-600';
  if (status === 'error') return 'text-red-600';
  if (status === 'canceled') return 'text-gray-400';
  return 'text-gray-400';
}

function downloadMarkdown(content: string, name: string) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.md') ? name : `${name}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AceabalizeV2Page() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [pastRunsOpen, setPastRunsOpen] = useState(false);

  // Upload state
  const [uploadedContent, setUploadedContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline state
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStatuses, setPipelineStatuses] = useState<Record<string, string>>({});
  const [pipelineOutput, setPipelineOutput] = useState('');
  const [pipelineDone, setPipelineDone] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState('');
  const [error, setError] = useState('');

  const pipelinePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiReviewRunning, setAiReviewRunning] = useState(false);
  const [aiReviewDone, setAiReviewDone] = useState(false);
  const [aiReviewCount, setAiReviewCount] = useState(0);

  useEffect(() => {
    void fetchSessions();
    return () => { if (pipelinePollRef.current) clearInterval(pipelinePollRef.current); };
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

  // ── File handling ─────────────────────────────────────────────────────────
  function readFile(file: File) {
    if (!(/\.(md|txt)$/i.exec(file.name))) {
      setError('Only .md and .txt files are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setUploadedContent((e.target?.result ?? '') as string);
      setUploadedFileName(file.name);
      setError('');
      setPipelineOutput('');
      setPipelineDone(false);
    };
    reader.readAsText(file);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) readFile(file);
   
  }, []);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
  }

  function loadFromSession(sessionId: string) {
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    setUploadedFileName(session.originalFileName);
    setUploadedContent(''); // content is in DB; will be used as sessionId reference
    setCurrentSessionId(sessionId);
    setPipelineOutput('');
    setPipelineDone(false);
    setError('');
  }

  // ── Pipeline ──────────────────────────────────────────────────────────────
  async function handleRunPipeline() {
    if (!uploadedContent.trim() && !currentSessionId) {
      setError('Please upload a file first');
      return;
    }
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
          content: uploadedContent,
          originalFileName: uploadedFileName || 'untitled',
          sessionId: currentSessionId || undefined,
        }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }

      const data = (await res.json()) as PipelineSubmitResponse;
      setCurrentSessionId(data.sessionId);
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
            if (!jid) return { phase, status: 'pending' };
            const r = await fetch(
              `/api/aceabalize-v2/${phase === 'book_ends' ? 'book-ends' : phase}/status/${jid}`
            );
            const d = (await r.json()) as JobStatus;
            return { phase, status: d.status };
          })
        );

        const statusMap: Record<string, string> = {};
        results.forEach((r) => { statusMap[r.phase] = r.status; });
        setPipelineStatuses(statusMap);

        const allDone = results.every(
          (r) => r.status === 'done' || r.status === 'error' || r.status === 'canceled'
        );

        if (allDone) {
          if (pipelinePollRef.current) clearInterval(pipelinePollRef.current);
          setPipelineRunning(false);
          const anyError = results.some((r) => r.status === 'error');
          setPipelineDone(!anyError);
          void fetchSessions();

          if (!anyError) {
            const finalRes = await fetch(`/api/aceabalize-v2/sessions/${sid}/artifacts/final_md`);
            if (finalRes.ok) {
              const finalData = (await finalRes.json()) as ArtifactResponse;
              setPipelineOutput(finalData.content ?? '');
            }
          }
        }
      })();
    }, 3000);
  }

  const canRun = (uploadedContent.trim().length > 0) && !pipelineRunning;

  async function handleRunAIReview() {
    if (!currentSessionId) return;
    setAiReviewRunning(true);
    setAiReviewDone(false);
    setError('');
    try {
      const res = await fetch(`/api/aceabalize-v2/sessions/${currentSessionId}/ai-review`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      const data = (await res.json()) as { recommendationsGenerated: number };
      setAiReviewCount(data.recommendationsGenerated);
      setAiReviewDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI Review failed');
    } finally {
      setAiReviewRunning(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      {settingsOpen && <PromptEditorModal onClose={() => setSettingsOpen(false)} />}

      {/* Header */}
      <div className="rounded-xl border-l-4 border-l-[#12BDCD] bg-background border border-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Aceabalize V2
              <button
                onClick={() => setSettingsOpen(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Prompt editor"
              >
                <Settings className="h-5 w-5" />
              </button>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Transform regulatory notes into clear, learner-friendly content
            </p>
          </div>
        </div>
      </div>

      {/* Past Runs */}
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <button
          onClick={() => { setPastRunsOpen((o) => !o); if (!pastRunsOpen) void fetchSessions(); }}
          className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="w-1 h-5 bg-[#12BDCD] rounded-full" />
            Past Runs
          </span>
          <ChevronDown className={`h-4 w-4 transition-transform text-muted-foreground ${pastRunsOpen ? 'rotate-180' : ''}`} />
        </button>

        {pastRunsOpen && (
          <div className="border-t border-border px-6 py-4">
            {loadingSessions && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loadingSessions && sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">No past runs yet.</p>
            )}
            {sessions.length > 0 && (
              <div className="space-y-2">
                {sessions.map((s) => {
                  const done = s.jobs.filter((j) => j.status === 'done').length;
                  const total = s.jobs.length;
                  return (
                    <button
                      key={s.sessionId}
                      onClick={() => { loadFromSession(s.sessionId); setPastRunsOpen(false); }}
                      className="w-full text-left rounded-lg border border-border hover:border-[#12BDCD]/50 hover:bg-muted/30 p-3 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium truncate">{s.originalFileName || 'untitled'}</p>
                        <span className="text-xs text-muted-foreground ml-2 shrink-0">
                          {done}/{total} phases · {new Date(s.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Upload Content */}
      <div className="rounded-xl border border-border bg-background overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span className="w-1 h-5 bg-[#12BDCD] rounded-full" />
            Upload Content
          </h2>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragging
                ? 'border-[#12BDCD] bg-[#12BDCD]/5'
                : uploadedContent
                ? 'border-green-400 bg-green-50/30'
                : 'border-border hover:border-[#12BDCD]/50 hover:bg-muted/20'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              className="hidden"
              onChange={handleFileInput}
            />
            <FileUp className={`h-8 w-8 mx-auto mb-3 ${uploadedContent ? 'text-green-500' : 'text-[#12BDCD]'}`} />
            {uploadedContent ? (
              <>
                <p className="text-sm font-medium text-green-700">{uploadedFileName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {uploadedContent.length.toLocaleString()} characters · click to replace
                </p>
              </>
            ) : (
              <>
                <p className="text-sm text-foreground">Drop your markdown file here or click to browse</p>
                <p className="text-xs text-[#12BDCD] mt-1">Supports .md and .txt files</p>
              </>
            )}
          </div>

          {/* Previous uploads dropdown */}
          {sessions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-center text-muted-foreground">or select a previous upload</p>
              <select
                onChange={(e) => { if (e.target.value) loadFromSession(e.target.value); }}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                defaultValue=""
              >
                <option value="">Select from previous uploads…</option>
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.originalFileName || 'untitled'} — {new Date(s.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Run button */}
          <button
            onClick={() => { void handleRunPipeline(); }}
            disabled={!canRun}
            className="w-fit px-6 py-2.5 rounded-lg bg-[#12BDCD] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#0fa8b8] transition-colors"
          >
            {pipelineRunning ? 'Running…' : 'Run Full Pipeline'}
          </button>
        </div>
      </div>

      {/* Pipeline progress — always visible */}
      <div className="rounded-xl border border-border bg-background overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <span className="w-1 h-5 bg-[#12BDCD] rounded-full" />
              Pipeline Phases
            </h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div className="grid grid-cols-4 gap-3">
              {PIPELINE_PHASES.map((phase, i) => {
                const status = pipelineStatuses[phase] ?? 'pending';
                return (
                  <div key={phase} className={`rounded-lg border p-3 text-center transition-colors ${
                    status === 'done' ? 'border-green-300 bg-green-50/40' :
                    status === 'running' ? 'border-blue-300 bg-blue-50/40' :
                    status === 'error' ? 'border-red-300 bg-red-50/40' :
                    'border-border'
                  }`}>
                    <p className="text-xs text-muted-foreground font-medium">{i + 1}. {PHASE_LABELS[phase]}</p>
                    <p className={`text-sm font-semibold mt-1 ${statusColor(status)}`}>{status}</p>
                  </div>
                );
              })}
            </div>

            {pipelineDone && pipelineOutput && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-green-600">Pipeline complete</p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { void navigator.clipboard.writeText(pipelineOutput); }}
                      className="text-xs text-[#12BDCD] hover:underline"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => downloadMarkdown(pipelineOutput, uploadedFileName || 'output')}
                      className="flex items-center gap-1 text-xs text-[#12BDCD] hover:underline"
                    >
                      <Download className="h-3 w-3" /> Download .md
                    </button>
                  </div>
                </div>

                {/* AI Review CTA */}
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-amber-900">Run AI Review</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {aiReviewDone
                        ? `${aiReviewCount} recommendation(s) generated — ready for Human Review`
                        : 'Claude will review the content for accuracy and generate recommendations'}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {aiReviewDone ? (
                      <button
                        onClick={() => router.push('/admin/human-review')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" /> Open Human Review
                      </button>
                    ) : (
                      <button
                        onClick={() => { void handleRunAIReview(); }}
                        disabled={aiReviewRunning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 hover:bg-amber-700 transition-colors"
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        {aiReviewRunning ? 'Running review…' : 'Run AI Review'}
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  value={pipelineOutput}
                  readOnly
                  rows={24}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm bg-muted font-mono resize-y"
                />
              </div>
            )}
          </div>
        </div>

    </div>
  );
}
