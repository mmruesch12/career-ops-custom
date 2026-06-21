import { BarChart3, FileText, Sparkles, Target } from 'lucide-react';
import type { PipelineMetrics } from '../lib/types';
import { formatScore } from '../lib/utils';

interface Props {
  metrics: PipelineMetrics;
}

export function MetricsBar({ metrics }: Props) {
  const items = [
    {
      icon: Target,
      label: 'Total',
      value: metrics.total.toString(),
      accent: 'text-blue',
    },
    {
      icon: Sparkles,
      label: 'Avg Score',
      value: metrics.avgScore > 0 ? formatScore(metrics.avgScore) : '—',
      accent: 'text-mauve',
    },
    {
      icon: BarChart3,
      label: 'Top Score',
      value: metrics.topScore > 0 ? formatScore(metrics.topScore) : '—',
      accent: 'text-green',
    },
    {
      icon: FileText,
      label: 'With PDF',
      value: metrics.withPDF.toString(),
      accent: 'text-peach',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="metric-card group">
          <div className="flex items-center gap-2 text-subtle">
            <item.icon className={`h-4 w-4 ${item.accent} opacity-80`} />
            <span className="text-xs font-medium uppercase tracking-wider">{item.label}</span>
          </div>
          <p className={`mt-2 font-display text-2xl font-semibold ${item.accent}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}