import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ClipboardCheck, ExternalLink, Inbox, Link2, Loader2, Plus, Trash2 } from 'lucide-react';
import { addPipelineUrl, evaluateOffer, removePipelineUrl } from '../lib/api';
import type { PipelineInbox } from '../lib/types';
import { ScoreBadge } from './ScoreBadge';

interface Props {
  inbox: PipelineInbox | null;
  loading: boolean;
  onRefresh: () => void;
  disabled?: boolean;
}

type EvalState = {
  status: 'idle' | 'evaluating' | 'success' | 'error';
  message?: string;
  reportNumber?: string;
  score?: number | string;
};

export function InboxView({ inbox, loading, onRefresh, disabled = false }: Props) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evalStates, setEvalStates] = useState<Record<string, EvalState>>({});
  const evalRequestIds = useRef<Record<string, number>>({});
  const evalInFlight = useRef<Set<string>>(new Set());

  const canEvaluate = inbox?.prerequisites?.canEvaluate
    ?? inbox?.prerequisites?.canGenerateResume
    ?? false;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await addPipelineUrl(url.trim());
      setUrl('');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add URL');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (itemUrl: string) => {
    setRemoving(itemUrl);
    setError(null);
    try {
      await removePipelineUrl(itemUrl);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove URL');
    } finally {
      setRemoving(null);
    }
  };

  const handleEvaluate = async (itemUrl: string) => {
    if (evalInFlight.current.has(itemUrl)) return;

    const requestId = (evalRequestIds.current[itemUrl] || 0) + 1;
    evalRequestIds.current[itemUrl] = requestId;
    evalInFlight.current.add(itemUrl);

    setEvalStates((prev) => ({
      ...prev,
      [itemUrl]: { status: 'evaluating', message: 'Evaluating offer… (60–180s)' },
    }));

    try {
      const result = await evaluateOffer(itemUrl);
      if (evalRequestIds.current[itemUrl] !== requestId) return;

      if (!result.ok || !result.reportNumber) {
        throw new Error(result.error || 'Evaluation failed');
      }

      setEvalStates((prev) => ({
        ...prev,
        [itemUrl]: {
          status: 'success',
          reportNumber: result.reportNumber,
          score: result.score,
          message: `Evaluated — report #${result.reportNumber} (${result.score ?? '?'}/5). ${result.removedFromPipeline ? 'Removed from inbox.' : ''}`,
        },
      }));

      onRefresh();
    } catch (err) {
      if (evalRequestIds.current[itemUrl] !== requestId) return;
      setEvalStates((prev) => ({
        ...prev,
        [itemUrl]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Evaluation failed',
        },
      }));
    } finally {
      if (evalRequestIds.current[itemUrl] === requestId) {
        evalInFlight.current.delete(itemUrl);
      }
    }
  };

  const pending = inbox?.pending ?? [];

  useEffect(() => {
    const pendingSet = new Set(pending.map((p) => p.url));
    setEvalStates((prev) => {
      const next: Record<string, EvalState> = {};
      for (const [itemUrl, state] of Object.entries(prev)) {
        if (pendingSet.has(itemUrl)) next[itemUrl] = state;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [inbox]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky/15 ring-1 ring-sky/30">
          <Inbox className="h-5 w-5 text-sky" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Pipeline Inbox</h2>
          <p className="text-sm text-subtle">
            Pending URLs from <code className="text-blue">data/pipeline.md</code>
          </p>
        </div>
        <span className="ml-auto rounded-full bg-sky/15 px-3 py-1 text-sm font-medium text-sky">
          {pending.length} pending
        </span>
      </div>

      {!canEvaluate && (
        <div className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Evaluation prerequisites missing</p>
              <ul className="mt-1 list-inside list-disc text-xs text-yellow/90">
                {!inbox?.prerequisites?.hasCv && (
                  <li>
                    Add <code className="text-blue">cv.md</code> in Profile
                  </li>
                )}
                {!inbox?.prerequisites?.hasXaiKey && (
                  <li>
                    Set <code className="text-blue">XAI_API_KEY</code> in <code className="text-blue">.env</code>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {disabled && (
        <div className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
          A scan is in progress — inbox edits are disabled until it finishes.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="url"
            placeholder="https://jobs.example.com/role/123"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
            className="w-full rounded-xl border border-overlay/50 bg-surface/50 py-2.5 pl-9 pr-4 text-sm text-text placeholder:text-muted focus:border-blue/50 focus:outline-none focus:ring-1 focus:ring-blue/30 disabled:opacity-50"
          />
        </div>
        <button
          type="submit"
          disabled={disabled || submitting || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue/20 px-4 py-2.5 text-sm font-medium text-blue ring-1 ring-blue/30 transition-colors hover:bg-blue/30 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add URL
        </button>
      </form>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-subtle">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading inbox...
        </div>
      ) : pending.length === 0 ? (
        <div className="glass-panel py-16 text-center">
          <p className="font-display text-lg text-subtle">Inbox is empty</p>
          <p className="mt-2 text-sm text-muted">
            Add job URLs above and evaluate them here — no CLI required.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((item) => {
            const evalState = evalStates[item.url] || { status: 'idle' };
            const isEvaluating = evalState.status === 'evaluating';
            const isSuccess = evalState.status === 'success';
            const numericScore = typeof evalState.score === 'number'
              ? evalState.score
              : parseFloat(String(evalState.score ?? ''));

            return (
              <div
                key={item.url}
                className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-blue hover:underline"
                >
                  {item.url}
                </a>

                <div className="flex flex-wrap items-center gap-2">
                  {evalState.status === 'success' && Number.isFinite(numericScore) && (
                    <ScoreBadge score={numericScore} />
                  )}

                  {isEvaluating ? (
                    <span className="inline-flex items-center gap-2 text-sm text-subtle">
                      <Loader2 className="h-4 w-4 animate-spin text-sky" />
                      {evalState.message || 'Evaluating…'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleEvaluate(item.url)}
                      disabled={disabled || !canEvaluate || isEvaluating || isSuccess}
                      title={
                        disabled
                          ? 'Scan in progress'
                          : !canEvaluate
                            ? 'Set up cv.md and XAI_API_KEY first'
                            : isSuccess
                              ? 'Already evaluated'
                              : undefined
                      }
                      className="inline-flex items-center gap-2 rounded-lg bg-sky/15 px-3 py-2 text-sm font-medium text-sky transition-colors hover:bg-sky/25 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Evaluate
                    </button>
                  )}

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-2 text-subtle transition-colors hover:bg-surface/60 hover:text-blue"
                    title="Open posting"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>

                  <button
                    type="button"
                    onClick={() => handleRemove(item.url)}
                    disabled={disabled || removing === item.url || isEvaluating}
                    className="rounded-lg p-2 text-subtle transition-colors hover:bg-red/10 hover:text-red disabled:opacity-50"
                    title="Remove from inbox"
                  >
                    {removing === item.url ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {evalState.status === 'error' && (
                  <p className="w-full text-sm text-red sm:order-last">{evalState.message}</p>
                )}
                {evalState.status === 'success' && evalState.message && (
                  <p className="w-full text-xs text-green sm:order-last">{evalState.message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}