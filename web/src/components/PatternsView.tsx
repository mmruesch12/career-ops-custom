import { AlertCircle, BarChart2, Loader2, Target, TrendingDown } from 'lucide-react';
import type { PatternsData } from '../lib/types';

interface Props {
  data: PatternsData | null;
  loading: boolean;
}

const IMPACT_COLORS = {
  high: 'text-red',
  medium: 'text-peach',
  low: 'text-yellow',
};

export function PatternsView({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading patterns...
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="glass-panel py-16 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-yellow" />
        <p className="mt-4 font-display text-lg text-subtle">{data.error}</p>
        {data.current !== undefined && data.threshold !== undefined && (
          <p className="mt-2 text-sm text-muted">
            {data.current}/{data.threshold} applications beyond &quot;Evaluated&quot;
          </p>
        )}
      </div>
    );
  }

  const archetypes = data?.archetypeBreakdown ?? [];
  const remote = data?.remotePolicy ?? [];
  const gaps = data?.techStackGaps ?? [];
  const recommendations = data?.recommendations ?? [];
  const blockers = data?.blockerAnalysis ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-mauve/15 ring-1 ring-mauve/30">
          <TrendingDown className="h-5 w-5 text-mauve" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Rejection Patterns</h2>
          <p className="text-sm text-subtle">
            Analysis from {data?.metadata?.total ?? 0} applications
            {data?.metadata?.dateRange && (
              <> ({data.metadata.dateRange.from} → {data.metadata.dateRange.to})</>
            )}
          </p>
        </div>
      </div>

      {data?.scoreThreshold && (
        <div className="metric-card">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-green" />
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">Score Threshold</p>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-green">
            {data.scoreThreshold.recommended}/5
          </p>
          <p className="mt-1 text-sm text-muted">{data.scoreThreshold.reasoning}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            <BarChart2 className="h-4 w-4 text-blue" />
            By Archetype
          </h3>
          {archetypes.length === 0 ? (
            <p className="text-sm text-muted">No archetype data</p>
          ) : (
            <div className="space-y-2">
              {archetypes.slice(0, 8).map((a) => {
                const rejectRate = a.total > 0 ? Math.round((a.negative / a.total) * 100) : 0;
                return (
                  <div key={a.archetype} className="flex items-center justify-between text-sm">
                    <span className="truncate text-subtle">{a.archetype}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green">{a.conversionRate}% conv</span>
                      <span className="text-red">{rejectRate}% rej</span>
                      <span className="text-muted">n={a.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Remote Policy
          </h3>
          {remote.length === 0 ? (
            <p className="text-sm text-muted">No remote policy data</p>
          ) : (
            <div className="space-y-2">
              {remote.map((r) => {
                const rejectRate = r.total > 0 ? Math.round((r.negative / r.total) * 100) : 0;
                return (
                  <div key={r.policy} className="flex items-center justify-between text-sm">
                    <span className="truncate text-subtle">{r.policy}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green">{r.conversionRate}% conv</span>
                      <span className="text-red">{rejectRate}% rej</span>
                      <span className="text-muted">n={r.total}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {blockers.length > 0 && (
        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Top Blockers
          </h3>
          <div className="flex flex-wrap gap-2">
            {blockers.slice(0, 8).map((b) => (
              <span
                key={b.blocker}
                className="rounded-full bg-red/10 px-3 py-1 text-xs font-medium text-red ring-1 ring-red/20"
              >
                {b.blocker} ({b.frequency}x, {b.percentage}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Top Tech Stack Gaps
          </h3>
          <div className="flex flex-wrap gap-2">
            {gaps.slice(0, 12).map((g) => (
              <span
                key={g.skill}
                className="rounded-full bg-peach/10 px-3 py-1 text-xs font-medium text-peach ring-1 ring-peach/20"
              >
                {g.skill} ({g.frequency}x)
              </span>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Recommendations
          </h3>
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className="rounded-xl border border-overlay/40 bg-surface/30 p-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase ${IMPACT_COLORS[r.impact as keyof typeof IMPACT_COLORS] || 'text-muted'}`}>
                    {r.impact}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-text">{r.action}</p>
                <p className="mt-1 text-xs text-muted">{r.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}