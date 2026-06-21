import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { ProgressMetrics } from '../lib/types';
import { formatScore } from '../lib/utils';

interface Props {
  metrics: ProgressMetrics;
}

const FUNNEL_COLORS = ['#89b4fa', '#cba6f7', '#89dceb', '#a6e3a1', '#fab387'];
const SCORE_COLORS = ['#a6e3a1', '#89b4fa', '#f9e2af', '#fab387', '#f38ba8'];

export function ProgressView({ metrics }: Props) {
  const rates = [
    { label: 'Response Rate', value: metrics.responseRate, color: 'text-sky' },
    { label: 'Interview Rate', value: metrics.interviewRate, color: 'text-mauve' },
    { label: 'Offer Rate', value: metrics.offerRate, color: 'text-green' },
  ];

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Active Apps', value: metrics.activeApps, color: 'text-blue' },
          { label: 'Offers', value: metrics.totalOffers, color: 'text-green' },
          { label: 'Avg Score', value: formatScore(metrics.avgScore), color: 'text-mauve' },
          { label: 'Top Score', value: formatScore(metrics.topScore), color: 'text-peach' },
        ].map((item) => (
          <div key={item.label} className="metric-card">
            <p className="text-xs font-medium uppercase tracking-wider text-subtle">{item.label}</p>
            <p className={`mt-2 font-display text-2xl font-semibold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <h3 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            <TrendingUp className="h-4 w-4 text-blue" />
            Application Funnel
          </h3>
          <div className="space-y-3">
            {metrics.funnelStages.map((stage, i) => (
              <div key={stage.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-text">{stage.label}</span>
                  <span className="text-subtle">
                    {stage.count}
                    <span className="ml-2 text-muted">({stage.pct.toFixed(0)}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(stage.pct, stage.count > 0 ? 4 : 0)}%`,
                      backgroundColor: FUNNEL_COLORS[i],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Conversion Rates
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {rates.map((rate) => (
              <div key={rate.label} className="text-center">
                <p className={`font-display text-3xl font-bold ${rate.color}`}>
                  {rate.value.toFixed(0)}%
                </p>
                <p className="mt-1 text-xs text-muted">{rate.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Score Distribution
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.scoreBuckets} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#45475a" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#a6adc8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#a6adc8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: '#313244',
                  border: '1px solid #45475a',
                  borderRadius: '8px',
                  color: '#cdd6f4',
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {metrics.scoreBuckets.map((_, i) => (
                  <Cell key={i} fill={SCORE_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-panel p-5">
          <h3 className="mb-4 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Weekly Activity
          </h3>
          {metrics.weeklyActivity.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={metrics.weeklyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#45475a" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fill: '#a6adc8', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => v.replace(/^\d{4}-/, '')}
                />
                <YAxis tick={{ fill: '#a6adc8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: '#313244',
                    border: '1px solid #45475a',
                    borderRadius: '8px',
                    color: '#cdd6f4',
                  }}
                />
                <Bar dataKey="count" fill="#89b4fa" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-sm text-muted">No activity data yet</p>
          )}
        </div>
      </div>
    </div>
  );
}