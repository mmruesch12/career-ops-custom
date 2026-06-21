import { useState } from 'react';
import { ExternalLink, Loader2, Radar, Terminal } from 'lucide-react';
import { runScan } from '../lib/api';
import type { ScanHistoryData, ScriptResult } from '../lib/types';

interface Props {
  history: ScanHistoryData | null;
  loading: boolean;
  onRefresh: () => void;
  onScanningChange?: (scanning: boolean) => void;
}

export function ScanView({ history, loading, onRefresh, onScanningChange }: Props) {
  const [scanning, setScanning] = useState(false);
  const [output, setOutput] = useState<ScriptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setScanning(true);
    onScanningChange?.(true);
    setError(null);
    setOutput(null);
    try {
      const result = await runScan();
      setOutput(result);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
      onScanningChange?.(false);
    }
  };

  const entries = history?.entries ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green/15 ring-1 ring-green/30">
          <Radar className="h-5 w-5 text-green" />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-lg font-semibold">Portal Scanner</h2>
          <p className="text-sm text-subtle">
            Scan job portals and view history from <code className="text-blue">data/scan-history.tsv</code>
          </p>
        </div>
        {history?.lastScanDate && (
          <span className="text-xs text-muted">Last scan: {history.lastScanDate}</span>
        )}
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-xl bg-green/20 px-4 py-2.5 text-sm font-medium text-green ring-1 ring-green/30 transition-colors hover:bg-green/30 disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          {scanning ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {scanning && (
        <div className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
          Scan in progress — script actions, inbox edits, and tracker updates are disabled until it finishes.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">{error}</div>
      )}

      {output && (
        <div className="glass-panel p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <Terminal className="h-3.5 w-3.5" />
            Scan output (exit {output.exitCode})
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-mantle p-3 text-xs text-subtle">
            {output.stdout || output.stderr || '(no output)'}
          </pre>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-subtle">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading scan history...
        </div>
      ) : entries.length === 0 ? (
        <div className="glass-panel py-16 text-center">
          <p className="font-display text-lg text-subtle">No scan history yet</p>
          <p className="mt-2 text-sm text-muted">
            Configure <code className="text-blue">portals.yml</code> and run a scan to discover new offers.
          </p>
        </div>
      ) : (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-overlay/50 bg-surface/40 text-subtle">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Portal</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">URL</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 100).map((entry, i) => (
                  <tr key={`${entry.url}-${i}`} className="border-b border-overlay/30 hover:bg-surface/20">
                    <td className="px-4 py-2.5 text-muted">{entry.firstSeen}</td>
                    <td className="px-4 py-2.5 text-text">{entry.company}</td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-subtle">{entry.title}</td>
                    <td className="px-4 py-2.5 text-muted">{entry.portal}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-surface px-2 py-0.5 text-muted ring-1 ring-overlay/40">
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{entry.location || '—'}</td>
                    <td className="px-4 py-2.5">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Link
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {entries.length > 100 && (
            <p className="px-4 py-3 text-xs text-muted">Showing 100 of {entries.length} entries</p>
          )}
        </div>
      )}
    </div>
  );
}