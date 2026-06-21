import { formatScore, scoreBg, scoreColor } from '../lib/utils';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreBadge({ score, size = 'md' }: Props) {
  if (!score || score <= 0) {
    return <span className="text-muted">—</span>;
  }

  const sizes = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-lg font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-display ring-1 ${scoreBg(score)} ${scoreColor(score)} ${sizes[size]}`}
    >
      {formatScore(score)}
    </span>
  );
}