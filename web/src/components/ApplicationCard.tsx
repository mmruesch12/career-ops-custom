import { Download, ExternalLink, FileText, MapPin } from 'lucide-react';
import { pdfUrl } from '../lib/api';
import type { Application } from '../lib/types';
import { timeAgo, workModeIcon } from '../lib/utils';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';

interface Props {
  app: Application;
  selected: boolean;
  onSelect: () => void;
}

export function ApplicationCard({ app, selected, onSelect }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group w-full cursor-pointer rounded-xl border p-4 text-left transition-all duration-200 ${
        selected
          ? 'border-blue/50 bg-blue/5 shadow-glow'
          : 'border-overlay/40 bg-surface/30 hover:border-overlay hover:bg-surface/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <ScoreBadge score={app.score} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-text group-hover:text-blue">
                {app.company}
              </h3>
              <p className="mt-0.5 text-sm text-subtle line-clamp-1">{app.role}</p>
            </div>
            <StatusBadge status={app.status} />
          </div>

          {app.tldr && (
            <p className="mt-2 text-sm leading-relaxed text-subtle line-clamp-2">{app.tldr}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {app.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {workModeIcon(app.workMode)} {app.location}
              </span>
            )}
            {app.workMode && (
              <span className="rounded bg-surface/60 px-1.5 py-0.5 text-subtle">{app.workMode}</span>
            )}
            {app.payRange && (
              <span className="text-green/80">
                {app.payRange}
                {app.paySource && (
                  <span className="ml-1 opacity-60">({app.paySource.toLowerCase()})</span>
                )}
              </span>
            )}
            <span>{timeAgo(app.date)}</span>
            {app.hasPDF && app.pdfPath && (
              <a
                href={pdfUrl(app.pdfPath)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-peach hover:underline"
              >
                <Download className="h-3 w-3" /> PDF
              </a>
            )}
            {app.hasPDF && !app.pdfPath && (
              <span className="inline-flex items-center gap-1 text-peach">
                <FileText className="h-3 w-3" /> PDF
              </span>
            )}
            {app.jobURL && (
              <a
                href={app.jobURL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-blue hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Job
              </a>
            )}
          </div>

          {app.archetype && (
            <p className="mt-2 text-xs text-mauve/80">{app.archetype}</p>
          )}
        </div>
      </div>
    </div>
  );
}