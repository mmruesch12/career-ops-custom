import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ClipboardCheck, Download, ExternalLink, Loader2, Sparkles, Target } from 'lucide-react';
import { evaluateOffer, generateResume, pdfUrl } from '../lib/api';
import type { EvaluatedMatch, MatchData, RecentDiscovery } from '../lib/types';
import { ScoreBadge } from './ScoreBadge';
import { timeAgo } from '../lib/utils';

interface Props {
  data: MatchData | null;
  loading: boolean;
  error?: string | null;
  onRefresh?: () => void;
  disabled?: boolean;
}

type GenState = {
  status: 'idle' | 'generating' | 'success' | 'error';
  message?: string;
  pdfFilename?: string;
};

type EvalState = {
  status: 'idle' | 'evaluating' | 'success' | 'error';
  message?: string;
  reportNumber?: string;
  score?: number | string;
};

export function MatchesView({ data, loading, error, onRefresh, disabled = false }: Props) {
  const [genStates, setGenStates] = useState<Record<string, GenState>>({});
  const [evalStates, setEvalStates] = useState<Record<string, EvalState>>({});
  const [localMatches, setLocalMatches] = useState<EvaluatedMatch[] | null>(null);
  const requestIds = useRef<Record<string, number>>({});
  const evalRequestIds = useRef<Record<string, number>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const evalInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    setLocalMatches(null);
  }, [data?.generatedAt]);

  useEffect(() => {
    const discoveryUrls = new Set(
      [
        ...(data?.tierADiscoveries ?? []),
        ...(data?.tierBDiscoveries ?? []),
        ...(data?.recentDiscoveries ?? []),
      ]
        .map((d) => d.url)
        .filter(Boolean),
    );
    setEvalStates((prev) => {
      const next: Record<string, EvalState> = {};
      for (const [itemUrl, state] of Object.entries(prev)) {
        if (discoveryUrls.has(itemUrl)) next[itemUrl] = state;
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [data?.generatedAt, data?.tierADiscoveries, data?.tierBDiscoveries, data?.recentDiscoveries]);

  const matches = localMatches ?? data?.evaluatedMatches ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading matches...
      </div>
    );
  }

  if (!data && error) {
    return (
      <div className="glass-panel py-16 text-center">
        <p className="font-display text-lg text-subtle">Failed to load matches</p>
        <p className="mt-2 text-sm text-muted">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const canGenerate = data.prerequisites?.canGenerateResume ?? false;
  const canEvaluate = data.prerequisites?.canEvaluate ?? false;
  const tierADiscoveries = data.tierADiscoveries ?? [];
  const tierBDiscoveries = data.tierBDiscoveries ?? [];
  const recentDiscoveries = data.recentDiscoveries ?? [];

  const handleGenerate = async (match: EvaluatedMatch) => {
    if (!match.reportNumber || inFlight.current.has(match.reportNumber)) return;

    const reportNumber = match.reportNumber;
    const requestId = (requestIds.current[reportNumber] || 0) + 1;
    requestIds.current[reportNumber] = requestId;
    inFlight.current.add(reportNumber);

    setGenStates((prev) => ({
      ...prev,
      [reportNumber]: { status: 'generating', message: 'Tailoring resume… (30–90s)' },
    }));

    try {
      const result = await generateResume(reportNumber);
      if (requestIds.current[reportNumber] !== requestId) return;

      if (!result.ok || !result.pdfFilename) {
        throw new Error(result.error || 'Resume generation failed');
      }

      const trackerNote = result.trackerUpdated === false
        ? ' (tracker not updated — download still works)'
        : '';
      setGenStates((prev) => ({
        ...prev,
        [reportNumber]: {
          status: 'success',
          pdfFilename: result.pdfFilename,
          message: `Resume ready — review before applying${trackerNote}`,
        },
      }));

      setLocalMatches((prev) => {
        const base = prev ?? data.evaluatedMatches;
        return base.map((m) =>
          m.reportNumber === reportNumber
            ? { ...m, hasPDF: true, pdfPath: result.pdfFilename! }
            : m,
        );
      });

      onRefresh?.();
    } catch (err) {
      if (requestIds.current[reportNumber] !== requestId) return;
      setGenStates((prev) => ({
        ...prev,
        [reportNumber]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Resume generation failed',
        },
      }));
    } finally {
      if (requestIds.current[reportNumber] === requestId) {
        inFlight.current.delete(reportNumber);
      }
    }
  };

  const handleEvaluate = async (discovery: RecentDiscovery) => {
    if (!discovery.url || evalInFlight.current.has(discovery.url)) return;

    const url = discovery.url;
    const requestId = (evalRequestIds.current[url] || 0) + 1;
    evalRequestIds.current[url] = requestId;
    evalInFlight.current.add(url);

    setEvalStates((prev) => ({
      ...prev,
      [url]: { status: 'evaluating', message: 'Evaluating offer… (60–180s)' },
    }));

    try {
      const result = await evaluateOffer(url);
      if (evalRequestIds.current[url] !== requestId) return;

      if (!result.ok || !result.reportNumber) {
        throw new Error(result.error || 'Evaluation failed');
      }

      setEvalStates((prev) => ({
        ...prev,
        [url]: {
          status: 'success',
          reportNumber: result.reportNumber,
          score: result.score,
          message: `Evaluated — ${result.company || 'role'} scored ${result.score ?? '?'}/5. See Pipeline for report #${result.reportNumber}.`,
        },
      }));

      onRefresh?.();
    } catch (err) {
      if (evalRequestIds.current[url] !== requestId) return;
      setEvalStates((prev) => ({
        ...prev,
        [url]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Evaluation failed',
        },
      }));
    } finally {
      if (evalRequestIds.current[url] === requestId) {
        evalInFlight.current.delete(url);
      }
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue/30 to-mauve/30 ring-1 ring-blue/20">
          <Sparkles className="h-5 w-5 text-blue" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Daily Matches</h2>
          <p className="text-sm text-subtle">
            Strong evaluated roles (score ≥ {data.minScore.toFixed(1)}) — generate a tailored resume in one click
          </p>
        </div>
      </div>

      {disabled && (
        <div className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
          A scan is in progress — evaluate actions are disabled until it finishes.
        </div>
      )}

      {(!canGenerate || !canEvaluate) && (
        <div className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Evaluate &amp; resume prerequisites missing</p>
              <ul className="mt-1 list-inside list-disc text-xs text-yellow/90">
                {!data.prerequisites.hasCv && (
                  <li>
                    Add <code className="text-blue">cv.md</code> (or <code className="text-blue">data/cv.md</code>) in Profile
                  </li>
                )}
                {!data.prerequisites.hasXaiKey && (
                  <li>
                    Set <code className="text-blue">XAI_API_KEY</code> in <code className="text-blue">.env</code> at repo root
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Evaluation and resume tailoring use xAI Grok with your real CV — always review reports and PDFs before applying.
              </p>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-green" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Strong matches
          </h3>
          <span className="rounded-full bg-green/10 px-2 py-0.5 text-xs text-green">
            {matches.length}
          </span>
        </div>

        {matches.length === 0 ? (
          <div className="glass-panel py-12 text-center">
            <p className="font-display text-base text-subtle">No strong matches right now</p>
            <p className="mt-2 text-sm text-muted">
              Evaluated applications scoring {data.minScore.toFixed(1)}+ will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {matches.map((match) => (
              <MatchCard
                key={match.reportNumber}
                match={match}
                genState={genStates[match.reportNumber] || { status: 'idle' }}
                canGenerate={canGenerate}
                onGenerate={() => handleGenerate(match)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-green" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Tier A (deterministic filters)
          </h3>
          <span className="rounded-full bg-green/10 px-2 py-0.5 text-xs text-green">
            {tierADiscoveries.length}
          </span>
          <span className="text-xs text-muted">primary targets · not yet evaluated</span>
        </div>

        {tierADiscoveries.length === 0 ? (
          <div className="glass-panel py-10 text-center">
            <p className="text-sm text-subtle">No Tier A discoveries right now</p>
            <p className="mt-1 text-xs text-muted">
              Roles matching your primary targets and senior AI signals appear here after a scan
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tierADiscoveries.map((discovery, index) => (
              <DiscoveryCard
                key={discovery.url || `tier-a-${index}`}
                discovery={discovery}
                evalState={evalStates[discovery.url] || { status: 'idle' }}
                canEvaluate={canEvaluate}
                disabled={disabled}
                onEvaluate={() => handleEvaluate(discovery)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-mauve" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Tier B (manager / director)
          </h3>
          <span className="rounded-full bg-mauve/10 px-2 py-0.5 text-xs text-mauve">
            {tierBDiscoveries.length}
          </span>
          <span className="text-xs text-muted">leadership roles · not yet evaluated</span>
        </div>

        {tierBDiscoveries.length === 0 ? (
          <div className="glass-panel py-10 text-center">
            <p className="text-sm text-subtle">No Tier B leadership discoveries right now</p>
            <p className="mt-1 text-xs text-muted">
              Manager, director, and head-of-AI roles with AI relevance appear here
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tierBDiscoveries.map((discovery, index) => (
              <DiscoveryCard
                key={discovery.url || `tier-b-${index}`}
                discovery={discovery}
                evalState={evalStates[discovery.url] || { status: 'idle' }}
                canEvaluate={canEvaluate}
                disabled={disabled}
                onEvaluate={() => handleEvaluate(discovery)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            New discoveries
          </h3>
          <span className="rounded-full bg-sky/10 px-2 py-0.5 text-xs text-sky">
            {recentDiscoveries.length}
          </span>
          <span className="text-xs text-muted">other filtered roles · last 14 days</span>
        </div>

        {recentDiscoveries.length === 0 ? (
          <div className="glass-panel py-10 text-center">
            <p className="text-sm text-subtle">No new scan discoveries in the last two weeks</p>
            <p className="mt-1 text-xs text-muted">Run Scan to find fresh roles, then evaluate them here</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentDiscoveries.map((discovery, index) => (
              <DiscoveryCard
                key={discovery.url || `discovery-${index}`}
                discovery={discovery}
                evalState={evalStates[discovery.url] || { status: 'idle' }}
                canEvaluate={canEvaluate}
                disabled={disabled}
                onEvaluate={() => handleEvaluate(discovery)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MatchCard({
  match,
  genState,
  canGenerate,
  onGenerate,
}: {
  match: EvaluatedMatch;
  genState: GenState;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const generatedPdf = genState.pdfFilename;
  const downloadFile = generatedPdf || match.pdfPath || '';
  const isGenerating = genState.status === 'generating';

  return (
    <div className="glass-panel flex flex-col p-5">
      <div className="flex items-start gap-3">
        <ScoreBadge score={match.score} />
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-base font-semibold text-text">{match.company}</h4>
          <p className="mt-0.5 text-sm text-subtle">{match.role}</p>
          {match.tldr && (
            <p className="mt-2 text-sm leading-relaxed text-muted line-clamp-2">{match.tldr}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{timeAgo(match.date)}</span>
            {match.remote && <span>{match.remote}</span>}
            {match.compEstimate && <span className="text-green/80">{match.compEstimate}</span>}
            {match.archetype && <span className="text-mauve/80">{match.archetype}</span>}
            {match.jobURL && (
              <a
                href={match.jobURL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Job
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-overlay/30 pt-4">
        {isGenerating ? (
          <span className="inline-flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="h-4 w-4 animate-spin text-blue" />
            {genState.message || 'Tailoring resume…'}
          </span>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating}
            title={!canGenerate ? 'Set up cv.md and XAI_API_KEY first' : undefined}
            className="inline-flex items-center gap-2 rounded-lg bg-blue/15 px-3 py-2 text-sm font-medium text-blue transition-colors hover:bg-blue/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Generate Resume
          </button>
        )}

        {downloadFile && (
          <a
            href={pdfUrl(downloadFile)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-green/10 px-3 py-2 text-sm font-medium text-green transition-colors hover:bg-green/20"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </a>
        )}

        {genState.status === 'error' && (
          <p className="w-full text-sm text-red">{genState.message}</p>
        )}
        {genState.status === 'success' && genState.message && (
          <p className="w-full text-xs text-green">{genState.message}</p>
        )}
      </div>
    </div>
  );
}

function DiscoveryCard({
  discovery,
  evalState,
  canEvaluate,
  disabled,
  onEvaluate,
}: {
  discovery: RecentDiscovery;
  evalState: EvalState;
  canEvaluate: boolean;
  disabled: boolean;
  onEvaluate: () => void;
}) {
  const isEvaluating = evalState.status === 'evaluating';
  const isSuccess = evalState.status === 'success';
  const numericScore = typeof evalState.score === 'number'
    ? evalState.score
    : parseFloat(String(evalState.score ?? ''));

  return (
    <div className="glass-panel flex flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-text">
            {discovery.company || 'Unknown company'}
          </p>
          <p className="mt-0.5 text-sm text-subtle line-clamp-2">
            {discovery.title || discovery.url}
          </p>
        </div>
        {evalState.status === 'success' && Number.isFinite(numericScore) ? (
          <ScoreBadge score={numericScore} />
        ) : (
          <a
            href={discovery.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted transition-colors hover:text-blue"
            title="Open job posting"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
        <span>{discovery.firstSeen}</span>
        {discovery.portal && (
          <span className="rounded bg-surface/60 px-1.5 py-0.5">{discovery.portal}</span>
        )}
        {discovery.location && <span>{discovery.location}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-overlay/30 pt-3">
        {isEvaluating ? (
          <span className="inline-flex items-center gap-2 text-sm text-subtle">
            <Loader2 className="h-4 w-4 animate-spin text-sky" />
            {evalState.message || 'Evaluating…'}
          </span>
        ) : (
          <button
            type="button"
            onClick={onEvaluate}
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
          href={discovery.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-blue hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> View posting
        </a>

        {evalState.status === 'error' && (
          <p className="w-full text-sm text-red">{evalState.message}</p>
        )}
        {evalState.status === 'success' && evalState.message && (
          <p className="w-full text-xs text-green">{evalState.message}</p>
        )}
      </div>
    </div>
  );
}