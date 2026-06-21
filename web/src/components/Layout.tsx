import {
  BarChart2,
  Bell,
  Briefcase,
  Inbox,
  Radar,
  RefreshCw,
  Terminal,
  TrendingDown,
  User,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppView } from '../lib/types';

const NAV_ITEMS: { id: AppView; label: string; icon: typeof Briefcase }[] = [
  { id: 'pipeline', label: 'Pipeline', icon: Briefcase },
  { id: 'progress', label: 'Progress', icon: BarChart2 },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'followups', label: 'Follow-ups', icon: Bell },
  { id: 'patterns', label: 'Patterns', icon: TrendingDown },
  { id: 'scan', label: 'Scan', icon: Radar },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'commands', label: 'Commands', icon: Terminal },
];

interface Props {
  children: ReactNode;
  view: AppView;
  onViewChange: (view: AppView) => void;
  onRefresh: () => void;
  loading?: boolean;
  inboxCount?: number;
}

export function Layout({ children, view, onViewChange, onRefresh, loading, inboxCount }: Props) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-overlay/40 bg-crust/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue/30 to-mauve/30 ring-1 ring-blue/20">
                <Briefcase className="h-5 w-5 text-blue" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold tracking-tight">
                  Career<span className="text-blue">-Ops</span>
                </h1>
                <p className="text-xs text-muted">Job search command center</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="rounded-lg p-2 text-subtle transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <nav className="mt-4 -mx-1 flex gap-1 overflow-x-auto pb-1">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
              const active = view === id;
              const badge = id === 'inbox' && inboxCount !== undefined && inboxCount > 0 ? inboxCount : null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onViewChange(id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue/15 text-blue'
                      : 'text-subtle hover:bg-surface hover:text-text'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                  {badge !== null && (
                    <span className="rounded-full bg-sky/20 px-1.5 py-0.5 text-xs text-sky">{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}