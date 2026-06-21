import { useEffect, useState } from 'react';
import {
  BarChart2,
  Bell,
  Briefcase,
  Check,
  ClipboardCopy,
  FileText,
  Inbox,
  Loader2,
  Radar,
  Terminal,
  TrendingDown,
  User,
  Zap,
} from 'lucide-react';
import { runDedup, runNormalize, runVerify } from '../lib/api';
import type { AppView, CommandCard } from '../lib/types';

interface Props {
  onNavigate: (view: AppView) => void;
}

const COMMANDS: CommandCard[] = [
  {
    id: 'auto-pipeline',
    title: 'Auto-Pipeline',
    description: 'Evaluate JD/URL, generate report, PDF, and tracker entry',
    cli: '/career-ops {paste JD text or URL}',
    category: 'ai',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    description: 'Process pending URLs from data/pipeline.md',
    cli: '/career-ops pipeline',
    category: 'view',
    view: 'inbox',
  },
  {
    id: 'scan',
    title: 'Scan',
    description: 'Scan job portals and discover new offers',
    cli: '/career-ops scan',
    category: 'view',
    view: 'scan',
  },
  {
    id: 'tracker',
    title: 'Tracker',
    description: 'Application status overview',
    cli: '/career-ops tracker',
    category: 'view',
    view: 'pipeline',
  },
  {
    id: 'patterns',
    title: 'Patterns',
    description: 'Analyze rejection patterns and improve targeting',
    cli: '/career-ops patterns',
    category: 'view',
    view: 'patterns',
  },
  {
    id: 'followup',
    title: 'Follow-up',
    description: 'Flag overdue follow-ups and generate draft messages',
    cli: '/career-ops followup',
    category: 'view',
    view: 'followups',
  },
  {
    id: 'oferta',
    title: 'Oferta',
    description: 'Evaluation only A-F (no auto PDF)',
    cli: '/career-ops oferta {JD or URL}',
    category: 'ai',
  },
  {
    id: 'ofertas',
    title: 'Ofertas',
    description: 'Compare and rank multiple offers',
    cli: '/career-ops ofertas',
    category: 'ai',
  },
  {
    id: 'pdf',
    title: 'PDF',
    description: 'Generate ATS-optimized CV PDF',
    cli: '/career-ops pdf {company-slug}',
    category: 'ai',
  },
  {
    id: 'latex',
    title: 'LaTeX',
    description: 'Export CV as LaTeX/Overleaf .tex',
    cli: '/career-ops latex {company-slug}',
    category: 'ai',
  },
  {
    id: 'cover',
    title: 'Cover Letter',
    description: 'Generate a tailored cover letter',
    cli: '/career-ops cover {slug}',
    category: 'ai',
  },
  {
    id: 'contacto',
    title: 'Contacto',
    description: 'LinkedIn power move: find contacts + draft message',
    cli: '/career-ops contacto {company}',
    category: 'ai',
  },
  {
    id: 'deep',
    title: 'Deep Research',
    description: 'Deep research prompt about a company',
    cli: '/career-ops deep {company}',
    category: 'ai',
  },
  {
    id: 'interview-prep',
    title: 'Interview Prep',
    description: 'Generate company-specific interview prep doc',
    cli: '/career-ops interview-prep {company}',
    category: 'ai',
  },
  {
    id: 'interview',
    title: 'Interview Onboarding',
    description: 'Interactive profile/CV onboarding interview',
    cli: '/career-ops interview',
    category: 'ai',
  },
  {
    id: 'apply',
    title: 'Apply Assistant',
    description: 'Live application assistant (reads form + generates answers)',
    cli: '/career-ops apply {company}',
    category: 'ai',
  },
  {
    id: 'batch',
    title: 'Batch',
    description: 'Batch processing with parallel workers',
    cli: '/career-ops batch',
    category: 'ai',
  },
  {
    id: 'training',
    title: 'Training',
    description: 'Evaluate course/cert against North Star',
    cli: '/career-ops training {course description}',
    category: 'ai',
  },
  {
    id: 'project',
    title: 'Project',
    description: 'Evaluate portfolio project idea',
    cli: '/career-ops project {idea}',
    category: 'ai',
  },
  {
    id: 'update',
    title: 'System Update',
    description: 'Update career-ops system files with diff preview',
    cli: 'node update-system.mjs check',
    category: 'script',
    action: 'update',
  },
  {
    id: 'verify',
    title: 'Verify Pipeline',
    description: 'Pipeline health check',
    cli: 'node verify-pipeline.mjs',
    category: 'script',
    action: 'verify',
  },
  {
    id: 'normalize',
    title: 'Normalize Statuses',
    description: 'Clean non-canonical states in applications.md',
    cli: 'node normalize-statuses.mjs',
    category: 'script',
    action: 'normalize',
  },
  {
    id: 'dedup',
    title: 'Dedup Tracker',
    description: 'Remove duplicate entries from applications.md',
    cli: 'node dedup-tracker.mjs',
    category: 'script',
    action: 'dedup',
  },
];

const VIEW_ICONS: Partial<Record<AppView, typeof Briefcase>> = {
  pipeline: Briefcase,
  progress: BarChart2,
  inbox: Inbox,
  followups: Bell,
  patterns: TrendingDown,
  scan: Radar,
  profile: User,
};

export function CommandsView({ onNavigate }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [output, setOutput] = useState<{ id: string; text: string; exitCode: number } | null>(null);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyCli = async (cmd: CommandCard) => {
    await navigator.clipboard.writeText(cmd.cli);
    setCopied(cmd.id);
  };

  const runAction = async (cmd: CommandCard) => {
    if (!cmd.action) return;
    setRunning(cmd.id);
    setOutput(null);
    try {
      let result;
      switch (cmd.action) {
        case 'verify':
          result = await runVerify();
          break;
        case 'normalize':
          result = await runNormalize();
          break;
        case 'dedup':
          result = await runDedup();
          break;
        default:
          return;
      }
      setOutput({
        id: cmd.id,
        text: result.stdout || result.stderr || '(no output)',
        exitCode: result.exitCode,
      });
    } catch (err) {
      setOutput({
        id: cmd.id,
        text: err instanceof Error ? err.message : 'Action failed',
        exitCode: 1,
      });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow/15 ring-1 ring-yellow/30">
          <Terminal className="h-5 w-5 text-yellow" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Command Center</h2>
          <p className="text-sm text-subtle">All career-ops modes — run in CLI or trigger from here</p>
        </div>
      </div>

      {output && (
        <div className="glass-panel p-4">
          <div className="mb-2 text-xs text-muted">Output (exit {output.exitCode})</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-mantle p-3 text-xs text-subtle">
            {output.text}
          </pre>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMMANDS.map((cmd) => {
          const ViewIcon = cmd.view ? VIEW_ICONS[cmd.view] : null;
          return (
            <div key={cmd.id} className="glass-panel flex flex-col p-4">
              <div className="flex items-start gap-2">
                {cmd.category === 'ai' ? (
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-mauve" />
                ) : cmd.category === 'view' && ViewIcon ? (
                  <ViewIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-green" />
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-sm font-semibold text-text">{cmd.title}</h3>
                  <p className="mt-1 text-xs text-muted">{cmd.description}</p>
                </div>
              </div>

              <code className="mt-3 block truncate rounded-lg bg-mantle px-2 py-1.5 text-xs text-blue">
                {cmd.cli}
              </code>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyCli(cmd)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface/60 px-2.5 py-1.5 text-xs text-subtle transition-colors hover:bg-surface hover:text-text"
                >
                  {copied === cmd.id ? (
                    <Check className="h-3 w-3 text-green" />
                  ) : (
                    <ClipboardCopy className="h-3 w-3" />
                  )}
                  {copied === cmd.id ? 'Copied' : 'Copy CLI'}
                </button>

                {cmd.view && (
                  <button
                    type="button"
                    onClick={() => onNavigate(cmd.view!)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue/10 px-2.5 py-1.5 text-xs text-blue transition-colors hover:bg-blue/20"
                  >
                    Open view
                  </button>
                )}

                {cmd.action && cmd.action !== 'update' && (
                  <button
                    type="button"
                    onClick={() => runAction(cmd)}
                    disabled={running === cmd.id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green/10 px-2.5 py-1.5 text-xs text-green transition-colors hover:bg-green/20 disabled:opacity-50"
                  >
                    {running === cmd.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Terminal className="h-3 w-3" />
                    )}
                    Run
                  </button>
                )}

                {cmd.action === 'update' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-yellow/10 px-2.5 py-1.5 text-xs text-yellow">
                    Run in terminal
                  </span>
                )}

                {cmd.category === 'ai' && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-mauve/10 px-2.5 py-1.5 text-xs text-mauve">
                    AI CLI only
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}