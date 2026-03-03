'use client';

import { useState, useEffect } from 'react';

interface SourceUrl {
  ref: string;
  url: string;
  description: string;
  is_placeholder: boolean;
}

interface Recommendation {
  recId: string;
  category: string | null;
  issue: string | null;
  recommendedLanguage: string | null;
  insertionPoint: string | null;
  sourceUrls: SourceUrl[];
  status: 'pending' | 'approved' | 'rejected';
  humanNotes: string | null;
}

interface Session {
  sessionId: string;
  originalFileName: string;
  createdAt: string;
  jobs: { status: string }[];
}

interface SessionsResponse {
  sessions: Session[];
}

interface ReviewData {
  sessionId: string;
  recommendations: Recommendation[];
  stats: { total: number; pending: number; approved: number; rejected: number };
}

type ReviewResponse = ReviewData;

function StatusBadge({ status }: { status: Recommendation['status'] }) {
  const styles: Record<Recommendation['status'], string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    approved: 'bg-green-100 text-green-800 border-green-200',
    rejected: 'bg-red-100 text-red-800 border-red-200',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function HumanReviewPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/aceabalize-v2/sessions');
      const data = (await res.json()) as SessionsResponse;
      setSessions(data.sessions);
    })();
  }, []);

  async function loadReview(sessionId: string) {
    setError('');
    setReviewData(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/review/${sessionId}`);
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      const data = (await res.json()) as ReviewResponse;
      setReviewData(data);
      const initialNotes: Record<string, string> = {};
      data.recommendations.forEach((r) => {
        initialNotes[r.recId] = r.humanNotes ?? '';
      });
      setNotes(initialNotes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function updateRec(recId: string, status: Recommendation['status']) {
    if (!reviewData) return;
    const humanNotes = notes[recId] ?? '';

    const res = await fetch(
      `/api/review/${reviewData.sessionId}/recommendation/${recId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, humanNotes }),
      }
    );

    if (!res.ok) return;

    setReviewData((prev) => {
      if (!prev) return prev;
      const updated = prev.recommendations.map((r) =>
        r.recId === recId ? { ...r, status, humanNotes } : r
      );
      const pending = updated.filter((r) => r.status === 'pending').length;
      const approved = updated.filter((r) => r.status === 'approved').length;
      const rejected = updated.filter((r) => r.status === 'rejected').length;
      return { ...prev, recommendations: updated, stats: { ...prev.stats, pending, approved, rejected } };
    });
  }

  async function handleComplete() {
    if (!reviewData) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/review/${reviewData.sessionId}/complete`, { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      await loadReview(reviewData.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCompleting(false);
    }
  }

  const allReviewed = reviewData ? reviewData.stats.pending === 0 : false;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Human Review</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Approve or reject AI-generated content recommendations
        </p>
      </div>

      {/* Session picker */}
      <div className="flex gap-3 items-end">
        <div className="flex-1 space-y-1.5">
          <label className="text-sm font-medium">Session</label>
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">— select a session —</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.originalFileName || 'untitled'} · {new Date(s.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => { void loadReview(selectedSession); }}
          disabled={!selectedSession || loading}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {reviewData && (
        <div className="space-y-5">
          {/* Stats bar */}
          <div className="flex items-center gap-6 rounded-lg border p-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{reviewData.stats.total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{reviewData.stats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{reviewData.stats.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{reviewData.stats.rejected}</p>
              <p className="text-xs text-muted-foreground">Rejected</p>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => { void handleComplete(); }}
                disabled={!allReviewed || completing}
                className="px-4 py-2 rounded-md bg-green-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-green-700 transition-colors"
              >
                {completing ? 'Completing…' : 'Mark Complete'}
              </button>
              {!allReviewed && (
                <p className="text-xs text-muted-foreground mt-1 text-right">
                  {reviewData.stats.pending} pending
                </p>
              )}
            </div>
          </div>

          {/* Recommendation cards */}
          <div className="space-y-4">
            {reviewData.recommendations.map((rec) => (
              <div
                key={rec.recId}
                className={`rounded-lg border p-5 space-y-4 transition-colors ${
                  rec.status === 'approved' ? 'border-green-200 bg-green-50/50' :
                  rec.status === 'rejected' ? 'border-red-200 bg-red-50/50' :
                  'border-border'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    {rec.category && (
                      <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">
                        {rec.category}
                      </span>
                    )}
                    <StatusBadge status={rec.status} />
                  </div>
                  {rec.insertionPoint && (
                    <p className="text-xs text-muted-foreground">
                      Location: <span className="font-medium">{rec.insertionPoint}</span>
                    </p>
                  )}
                </div>

                {rec.issue && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Issue</p>
                    <p className="text-sm">{rec.issue}</p>
                  </div>
                )}

                {rec.recommendedLanguage && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Recommended language</p>
                    <p className="text-sm bg-muted rounded-md px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                      {rec.recommendedLanguage}
                    </p>
                  </div>
                )}

                {rec.sourceUrls.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sources</p>
                    <ul className="space-y-1">
                      {rec.sourceUrls.map((s) => (
                        <li key={s.ref} className="text-xs">
                          {s.is_placeholder ? (
                            <span className="text-muted-foreground">{s.ref} — {s.description}</span>
                          ) : (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {s.ref} — {s.description}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <textarea
                  placeholder="Add notes (optional)…"
                  value={notes[rec.recId] ?? ''}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [rec.recId]: e.target.value }))
                  }
                  rows={2}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-none"
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => { void updateRec(rec.recId, 'approved'); }}
                    disabled={rec.status === 'approved'}
                    className="px-4 py-1.5 rounded-md bg-green-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-green-700 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => { void updateRec(rec.recId, 'rejected'); }}
                    disabled={rec.status === 'rejected'}
                    className="px-4 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium disabled:opacity-40 hover:bg-red-700 transition-colors"
                  >
                    Reject
                  </button>
                  {rec.status !== 'pending' && (
                    <button
                      onClick={() => { void updateRec(rec.recId, 'pending'); }}
                      className="px-4 py-1.5 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            ))}

            {reviewData.recommendations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No recommendations for this session. Use the seed API to load recommendations.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
