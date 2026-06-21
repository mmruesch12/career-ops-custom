import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, Save, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generatePdf, pdfUrl, updateNotes } from '../lib/api';
import type { Application } from '../lib/types';
import { ScoreBadge } from './ScoreBadge';
import { StatusBadge } from './StatusBadge';

interface Props {
  application: Application;
  content: string;
  onClose: () => void;
  onStatusChange?: (status: string) => void;
  onNotesChange?: (notes: string) => void;
  onPdfGenerated?: (outputPath: string) => void;
  states?: { id: string; label: string }[];
  statusError?: string | null;
  statusUpdating?: boolean;
}

function resolveStatusLabel(status: string, states: { id: string; label: string }[]) {
  const exact = states.find((s) => s.label === status);
  if (exact) return exact.label;
  const lower = status.toLowerCase().replace(/\*\*/g, '').trim();
  const byId = states.find((s) => s.id === lower || s.label.toLowerCase() === lower);
  return byId?.label ?? status;
}

export function ReportViewer({
  application,
  content,
  onClose,
  onStatusChange,
  onNotesChange,
  onPdfGenerated,
  states,
  statusError,
  statusUpdating,
}: Props) {
  const [notes, setNotes] = useState(application.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [generatedPdfPath, setGeneratedPdfPath] = useState<string | null>(null);

  useEffect(() => {
    setNotes(application.notes);
  }, [application.reportNumber, application.notes]);

  useEffect(() => {
    setGeneratedPdfPath(null);
    setPdfError(null);
    setNotesError(null);
  }, [application.reportNumber]);

  const pdfFilename = generatedPdfPath || application.pdfPath || null;

  const handleSaveNotes = async () => {
    if (!application.reportNumber) return;
    if (notes.includes('|') || notes.includes('\n') || notes.includes('\r')) {
      setNotesError('Notes cannot contain pipe (|) or line breaks');
      return;
    }
    setSavingNotes(true);
    setNotesError(null);
    try {
      await updateNotes(application.reportNumber, notes);
      onNotesChange?.(notes);
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleGeneratePdf = async () => {
    if (!application.reportNumber) return;
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      const result = await generatePdf(application.reportNumber);
      if (result.exitCode !== 0) {
        setPdfError(result.error || result.stderr || 'PDF generation failed');
        return;
      }
      if (result.outputPath) {
        const filename = result.outputPath.replace(/^output\//, '');
        setGeneratedPdfPath(filename);
        onPdfGenerated?.(filename);
      }
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF generation failed');
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="flex h-full flex-col animate-fade-in">
      <div className="flex items-start justify-between gap-4 border-b border-overlay/50 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <ScoreBadge score={application.score} size="lg" />
            <div>
              <h2 className="font-display text-xl font-semibold">{application.company}</h2>
              <p className="text-sm text-subtle">{application.role}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={application.status} />
            {onStatusChange && states && (
              <select
                value={resolveStatusLabel(application.status, states)}
                onChange={(e) => onStatusChange(e.target.value)}
                disabled={statusUpdating}
                className="rounded-lg border border-overlay bg-surface px-2 py-1 text-xs text-text focus:border-blue focus:outline-none disabled:opacity-50"
              >
                {states.map((s) => (
                  <option key={s.id} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {application.jobURL && (
              <a
                href={application.jobURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue hover:underline"
              >
                View posting →
              </a>
            )}
            {pdfFilename && (
              <a
                href={pdfUrl(pdfFilename)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-peach/10 px-2 py-1 text-xs text-peach ring-1 ring-peach/20 hover:bg-peach/20"
              >
                <Download className="h-3 w-3" />
                PDF
              </a>
            )}
            {application.hasPDF && !pdfFilename && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-peach/10 px-2 py-1 text-xs text-peach ring-1 ring-peach/20">
                <FileText className="h-3 w-3" />
                PDF (tracker)
              </span>
            )}
            <button
              type="button"
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
              className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs text-subtle ring-1 ring-overlay/40 hover:text-text disabled:opacity-50"
            >
              {generatingPdf ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <FileText className="h-3 w-3" />
              )}
              Generate PDF
            </button>
          </div>
          {statusError && (
            <p className="mt-2 text-xs text-red">{statusError}</p>
          )}
          {pdfError && (
            <p className="mt-2 text-xs text-red">{pdfError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-subtle transition-colors hover:bg-surface hover:text-text"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="border-b border-overlay/50 py-3">
        <label className="text-xs font-medium uppercase tracking-wider text-subtle">Notes</label>
        <div className="mt-2 flex gap-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-overlay/50 bg-surface/50 px-3 py-2 text-xs text-text placeholder:text-muted focus:border-blue/50 focus:outline-none focus:ring-1 focus:ring-blue/30"
            placeholder="Add notes..."
          />
          <button
            type="button"
            onClick={handleSaveNotes}
            disabled={savingNotes || notes === application.notes}
            className="self-end rounded-lg bg-blue/15 px-3 py-2 text-xs text-blue ring-1 ring-blue/30 hover:bg-blue/25 disabled:opacity-50"
          >
            {savingNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
        </div>
        {notesError && (
          <p className="mt-2 text-xs text-red">{notesError}</p>
        )}
      </div>

       <div className="prose-career flex-1 overflow-y-auto py-6 pr-2">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}