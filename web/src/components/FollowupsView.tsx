import { AlertTriangle, Bell, Clock, Loader2, Mail } from 'lucide-react';
import type { FollowupsData } from '../lib/types';
import { StatusBadge } from './StatusBadge';

interface Props {
  data: FollowupsData | null;
  loading: boolean;
}

const URGENCY_STYLES = {
  urgent: 'bg-red/15 text-red ring-red/30',
  overdue: 'bg-peach/15 text-peach ring-peach/30',
  waiting: 'bg-yellow/15 text-yellow ring-yellow/30',
  cold: 'bg-muted/15 text-muted ring-muted/30',
};

export function FollowupsView({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading follow-ups...
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="glass-panel py-16 text-center">
        <p className="font-display text-lg text-subtle">{data.error}</p>
      </div>
    );
  }

  const meta = data?.metadata;
  const entries = data?.entries ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-peach/15 ring-1 ring-peach/30">
          <Bell className="h-5 w-5 text-peach" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Follow-up Cadence</h2>
          <p className="text-sm text-subtle">Overdue and due follow-ups from your active applications</p>
        </div>
      </div>

      {meta && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Actionable', value: meta.actionable, color: 'text-blue' },
            { label: 'Urgent', value: meta.urgent, color: 'text-red' },
            { label: 'Overdue', value: meta.overdue, color: 'text-peach' },
            { label: 'Waiting', value: meta.waiting, color: 'text-yellow' },
            { label: 'Cold', value: meta.cold, color: 'text-muted' },
          ].map((item) => (
            <div key={item.label} className="metric-card">
              <p className="text-xs font-medium uppercase tracking-wider text-subtle">{item.label}</p>
              <p className={`mt-2 font-display text-2xl font-semibold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="glass-panel py-16 text-center">
          <p className="font-display text-lg text-subtle">No active follow-ups</p>
          <p className="mt-2 text-sm text-muted">Apply to some roles and check back later.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const contact = entry.contacts[0];
            const isOverdue = entry.urgency === 'overdue' || entry.urgency === 'urgent';
            return (
              <div key={`${entry.num}-${entry.company}`} className="glass-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-text">{entry.company}</h3>
                      <StatusBadge status={entry.status} />
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${URGENCY_STYLES[entry.urgency]}`}>
                        {entry.urgency}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-subtle">{entry.role}</p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <div className="flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {entry.daysSinceApplication}d since applied
                    </div>
                    {entry.nextFollowupDate && (
                      <p className="mt-1">
                        Next: {entry.nextFollowupDate}
                        {entry.daysUntilNext !== null && entry.daysUntilNext < 0 && (
                          <span className="ml-1 text-red">({Math.abs(entry.daysUntilNext)}d overdue)</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
                  <span>Follow-ups sent: {entry.followupCount}</span>
                  {contact?.email && (
                    <span className="inline-flex items-center gap-1 text-blue">
                      <Mail className="h-3 w-3" />
                      {contact.email}
                    </span>
                  )}
                  {contact?.name && <span>{contact.name}</span>}
                </div>

                {isOverdue && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg bg-peach/10 px-3 py-2 text-xs text-peach">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      Suggested action: send follow-up #{entry.followupCount + 1}. Run{' '}
                      <code className="text-peach/90">/career-ops followup</code> to generate a draft.
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}