export function formatScore(score: number): string {
  if (!score || score <= 0) return '—';
  return score.toFixed(1);
}

export function scoreColor(score: number): string {
  if (score >= 4.5) return 'text-green';
  if (score >= 4.0) return 'text-blue';
  if (score >= 3.5) return 'text-yellow';
  if (score >= 3.0) return 'text-peach';
  return 'text-red';
}

export function scoreBg(score: number): string {
  if (score >= 4.5) return 'bg-green/15 ring-green/30';
  if (score >= 4.0) return 'bg-blue/15 ring-blue/30';
  if (score >= 3.5) return 'bg-yellow/15 ring-yellow/30';
  if (score >= 3.0) return 'bg-peach/15 ring-peach/30';
  return 'bg-red/15 ring-red/30';
}

export function statusConfig(status: string) {
  const norm = status.toLowerCase();
  if (norm.includes('interview')) return { label: 'Interview', color: 'bg-mauve/20 text-mauve ring-mauve/30' };
  if (norm.includes('offer')) return { label: 'Offer', color: 'bg-green/20 text-green ring-green/30' };
  if (norm.includes('responded')) return { label: 'Responded', color: 'bg-sky/20 text-sky ring-sky/30' };
  if (norm.includes('applied')) return { label: 'Applied', color: 'bg-blue/20 text-blue ring-blue/30' };
  if (norm.includes('rejected')) return { label: 'Rejected', color: 'bg-red/20 text-red ring-red/30' };
  if (norm.includes('skip')) return { label: 'Skip', color: 'bg-muted/20 text-muted ring-muted/30' };
  if (norm.includes('discarded')) return { label: 'Discarded', color: 'bg-overlay/40 text-subtle ring-overlay/30' };
  return { label: status, color: 'bg-yellow/20 text-yellow ring-yellow/30' };
}

export function workModeIcon(mode: string): string {
  switch (mode) {
    case 'Remote':
    case 'RemoteFlex':
      return '🌐';
    case 'Hybrid':
      return '↔';
    case 'Full':
      return '🏢';
    default:
      return '';
  }
}

export function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  const days = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}