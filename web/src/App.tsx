import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Loader2, Search } from 'lucide-react';
import { ApplicationCard } from './components/ApplicationCard';
import { CommandsView } from './components/CommandsView';
import { FilterTabs } from './components/FilterTabs';
import { FollowupsView } from './components/FollowupsView';
import { InboxView } from './components/InboxView';
import { Layout } from './components/Layout';
import { MetricsBar } from './components/MetricsBar';
import { PatternsView } from './components/PatternsView';
import { ProfileView } from './components/ProfileView';
import { ProgressView } from './components/ProgressView';
import { ReportViewer } from './components/ReportViewer';
import { ScanView } from './components/ScanView';
import {
  fetchApplications,
  fetchDoctor,
  fetchFollowups,
  fetchPatterns,
  fetchPipelineInbox,
  fetchProfile,
  fetchProgress,
  fetchReport,
  fetchScanHistory,
  fetchStates,
  updateStatus,
} from './lib/api';
import type {
  AppView,
  Application,
  DoctorData,
  FollowupsData,
  PatternsData,
  PipelineInbox,
  PipelineMetrics,
  ProfileData,
  ProgressMetrics,
  ScanHistoryData,
  SortMode,
  StateOption,
  StatusFilter,
} from './lib/types';

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: 'score', label: 'Score' },
  { id: 'date', label: 'Date' },
  { id: 'company', label: 'Company' },
  { id: 'status', label: 'Status' },
  { id: 'location', label: 'Location' },
  { id: 'pay', label: 'Pay' },
  { id: 'last', label: 'Last Contact' },
];

const LAZY_VIEWS: AppView[] = ['inbox', 'followups', 'patterns', 'scan', 'profile'];

async function fetchViewData(view: AppView): Promise<{
  inbox?: PipelineInbox;
  followups?: FollowupsData;
  patterns?: PatternsData;
  scanHistory?: ScanHistoryData;
  profile?: ProfileData;
  doctor?: DoctorData;
  doctorError?: string | null;
}> {
  switch (view) {
    case 'followups':
      return { followups: await fetchFollowups() };
    case 'patterns':
      return { patterns: await fetchPatterns() };
    case 'scan':
      return { scanHistory: await fetchScanHistory() };
    case 'profile': {
      const [profileResult, doctorResult] = await Promise.allSettled([
        fetchProfile(),
        fetchDoctor(),
      ]);
      if (profileResult.status === 'rejected') {
        throw profileResult.reason;
      }
      const result: {
        profile: ProfileData;
        doctor?: DoctorData;
        doctorError?: string | null;
      } = { profile: profileResult.value };
      if (doctorResult.status === 'fulfilled') {
        result.doctor = doctorResult.value;
        result.doctorError = null;
      } else {
        const reason = doctorResult.reason;
        result.doctorError = reason instanceof Error ? reason.message : 'Doctor check failed';
      }
      return result;
    }
    case 'inbox':
      return {};
    default:
      return {};
  }
}

function clearViewState(
  view: AppView,
  setters: {
    setInbox: (v: PipelineInbox | null) => void;
    setFollowups: (v: FollowupsData | null) => void;
    setPatterns: (v: PatternsData | null) => void;
    setScanHistory: (v: ScanHistoryData | null) => void;
    setProfile: (v: ProfileData | null) => void;
    setDoctor: (v: DoctorData | null) => void;
    setDoctorError: (v: string | null) => void;
  },
) {
  if (view === 'followups') setters.setFollowups(null);
  if (view === 'patterns') setters.setPatterns(null);
  if (view === 'scan') setters.setScanHistory(null);
  if (view === 'profile') {
    setters.setProfile(null);
    setters.setDoctor(null);
    setters.setDoctorError(null);
  }
}

export default function App() {
  const [view, setView] = useState<AppView>('pipeline');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortMode>('score');
  const [search, setSearch] = useState('');
  const [applications, setApplications] = useState<Application[]>([]);
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [progress, setProgress] = useState<ProgressMetrics | null>(null);
  const [states, setStates] = useState<StateOption[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inbox, setInbox] = useState<PipelineInbox | null>(null);
  const [followups, setFollowups] = useState<FollowupsData | null>(null);
  const [patterns, setPatterns] = useState<PatternsData | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [allApplicationsCount, setAllApplicationsCount] = useState(0);

  const viewRequestId = useRef(0);
  const reportRequestId = useRef(0);

  const loadPipelineData = useCallback(async () => {
    const [appsRes, progressRes, statesRes, inboxRes] = await Promise.all([
      fetchApplications(filter, sort),
      fetchProgress(),
      fetchStates(),
      fetchPipelineInbox(),
    ]);
    setApplications(appsRes.applications);
    setMetrics(appsRes.metrics);
    setAllApplicationsCount(appsRes.metrics.total);
    setProgress(progressRes);
    setStates(statesRes);
    setInbox(inboxRes);
  }, [filter, sort]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPipelineData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [loadPipelineData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!LAZY_VIEWS.includes(view)) return;

    const requestId = ++viewRequestId.current;
    clearViewState(view, {
      setInbox,
      setFollowups,
      setPatterns,
      setScanHistory,
      setProfile,
      setDoctor,
      setDoctorError,
    });
    setViewLoading(true);
    setViewError(null);

    fetchViewData(view)
      .then((data) => {
        if (viewRequestId.current !== requestId) return;
        if (data.inbox !== undefined) setInbox(data.inbox);
        if (data.followups !== undefined) setFollowups(data.followups);
        if (data.patterns !== undefined) setPatterns(data.patterns);
        if (data.scanHistory !== undefined) setScanHistory(data.scanHistory);
        if (data.profile !== undefined) setProfile(data.profile);
        if (data.doctor !== undefined) setDoctor(data.doctor);
        if (data.doctorError !== undefined) setDoctorError(data.doctorError);
      })
      .catch((err) => {
        if (viewRequestId.current !== requestId) return;
        setViewError(err instanceof Error ? err.message : 'Failed to load view');
      })
      .finally(() => {
        if (viewRequestId.current === requestId) setViewLoading(false);
      });
  }, [view]);

  const loadReport = async (app: Application) => {
    if (!app.reportNumber) return;
    const requestId = ++reportRequestId.current;
    setSelected(app);
    setReportLoading(true);
    setReportContent(null);
    setStatusError(null);
    try {
      const res = await fetchReport(app.reportNumber);
      if (reportRequestId.current !== requestId) return;
      setReportContent(res.content);
      setSelected(res.application);
    } catch {
      if (reportRequestId.current !== requestId) return;
      setReportContent('Report not found.');
    } finally {
      if (reportRequestId.current === requestId) setReportLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!selected?.reportNumber) return;
    setStatusUpdating(true);
    setStatusError(null);
    const reportNumber = selected.reportNumber;
    try {
      await updateStatus(reportNumber, status);
      await loadPipelineData();
      const res = await fetchReport(reportNumber);
      setSelected(res.application);
      setReportContent(res.content);
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleNotesChange = async (notes: string) => {
    if (!selected) return;
    setSelected({ ...selected, notes });
    await loadPipelineData();
  };

  const handlePdfGenerated = async (outputPath: string) => {
    const reportNumber = selected?.reportNumber;
    if (!reportNumber) return;

    const filename = outputPath.replace(/^output\//, '');
    setSelected((prev) =>
      prev?.reportNumber === reportNumber
        ? { ...prev, pdfPath: filename, hasPDF: true }
        : prev,
    );

    await loadPipelineData();

    const res = await fetchReport(reportNumber);
    setSelected((prev) => (prev?.reportNumber === reportNumber ? res.application : prev));
  };

  const refreshCurrentView = async () => {
    await loadData();
    if (LAZY_VIEWS.includes(view)) {
      const requestId = ++viewRequestId.current;
      setViewLoading(true);
      setViewError(null);
      try {
        const data = await fetchViewData(view);
        if (viewRequestId.current !== requestId) return;
        if (data.inbox !== undefined) setInbox(data.inbox);
        if (data.followups !== undefined) setFollowups(data.followups);
        if (data.patterns !== undefined) setPatterns(data.patterns);
        if (data.scanHistory !== undefined) setScanHistory(data.scanHistory);
        if (data.profile !== undefined) setProfile(data.profile);
        if (data.doctor !== undefined) setDoctor(data.doctor);
        if (data.doctorError !== undefined) setDoctorError(data.doctorError);
      } catch (err) {
        if (viewRequestId.current === requestId) {
          setViewError(err instanceof Error ? err.message : 'Failed to load view');
        }
      } finally {
        if (viewRequestId.current === requestId) setViewLoading(false);
      }
    }
  };

  const refreshInbox = async () => {
    try {
      setInbox(await fetchPipelineInbox());
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to refresh inbox');
    }
  };

  const refreshScan = async () => {
    try {
      setScanHistory(await fetchScanHistory());
    } catch (err) {
      setViewError(err instanceof Error ? err.message : 'Failed to refresh scan history');
    }
  };

  const filteredApps = applications.filter((app) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      app.company.toLowerCase().includes(q) ||
      app.role.toLowerCase().includes(q) ||
      app.archetype.toLowerCase().includes(q) ||
      app.tldr.toLowerCase().includes(q) ||
      app.notes.toLowerCase().includes(q)
    );
  });

  const tabCounts = metrics
    ? {
        total: metrics.total,
        evaluated: metrics.byStatus.evaluated || 0,
        applied: metrics.byStatus.applied || 0,
        interview:
          (metrics.byStatus.interview || 0) +
          (metrics.byStatus.responded || 0) +
          (metrics.byStatus.offer || 0),
        top: metrics.topCount ?? 0,
        skip: metrics.byStatus.skip || 0,
        rejected: metrics.byStatus.rejected || 0,
        discarded: metrics.byStatus.discarded || 0,
      }
    : undefined;

  return (
    <Layout
      view={view}
      onViewChange={setView}
      onRefresh={refreshCurrentView}
      loading={loading || viewLoading}
      inboxCount={inbox?.pending.length}
    >
      {error && (
        <div className="mb-6 rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">
          {error}
        </div>
      )}
      {viewError && LAZY_VIEWS.includes(view) && view !== 'profile' && (
        <div className="mb-6 rounded-xl border border-red/30 bg-red/10 px-4 py-3 text-sm text-red">
          {viewError}
        </div>
      )}

      {view === 'progress' && (
        loading && !progress ? (
          <div className="flex items-center justify-center py-24 text-subtle">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading progress...
          </div>
        ) : progress ? (
          <ProgressView metrics={progress} />
        ) : (
          <div className="glass-panel py-16 text-center">
            <p className="font-display text-lg text-subtle">Progress data unavailable</p>
          </div>
        )
      )}

      {view === 'inbox' && (
        <InboxView inbox={inbox} loading={viewLoading} onRefresh={refreshInbox} disabled={scanning} />
      )}

      {view === 'followups' && (
        <FollowupsView data={followups} loading={viewLoading} />
      )}

      {view === 'patterns' && (
        <PatternsView data={patterns} loading={viewLoading} />
      )}

      {view === 'scan' && (
        <ScanView
          history={scanHistory}
          loading={viewLoading}
          onRefresh={refreshScan}
          onScanningChange={setScanning}
        />
      )}

      {view === 'profile' && (
        <ProfileView
          profile={profile}
          doctor={doctor}
          doctorError={doctorError}
          loading={viewLoading}
          error={viewError}
        />
      )}

      {view === 'commands' && <CommandsView onNavigate={setView} />}

      {view === 'pipeline' && (
        <div className="space-y-6 animate-fade-in">
          {metrics && <MetricsBar metrics={metrics} />}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <FilterTabs active={filter} onChange={setFilter} counts={tabCounts} />
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search companies, roles..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-overlay/50 bg-surface/50 py-2 pl-9 pr-4 text-sm text-text placeholder:text-muted focus:border-blue/50 focus:outline-none focus:ring-1 focus:ring-blue/30 sm:w-56"
                />
              </div>
              <div className="relative">
                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortMode)}
                  className="appearance-none rounded-xl border border-overlay/50 bg-surface/50 py-2 pl-9 pr-8 text-sm text-text focus:border-blue/50 focus:outline-none focus:ring-1 focus:ring-blue/30"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-subtle">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading pipeline...
            </div>
          ) : filteredApps.length === 0 ? (
            <div className="glass-panel py-24 text-center">
              {allApplicationsCount === 0 ? (
                <>
                  <p className="font-display text-lg text-subtle">No applications yet</p>
                  <p className="mt-2 text-sm text-muted">
                    Run <code className="rounded bg-surface px-1.5 py-0.5 text-blue">/career-ops</code> in your AI CLI to evaluate your first offer.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-display text-lg text-subtle">No matching applications</p>
                  <p className="mt-2 text-sm text-muted">
                    Try a different filter or clear your search.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-5">
              <div className={`space-y-3 ${selected ? 'lg:col-span-2' : 'lg:col-span-5'}`}>
                {filteredApps.map((app) => (
                  <ApplicationCard
                    key={`${app.number}-${app.reportNumber}`}
                    app={app}
                    selected={selected?.reportNumber === app.reportNumber}
                    onSelect={() => loadReport(app)}
                  />
                ))}
              </div>

              {selected && (
                <div className="glass-panel sticky top-24 h-[calc(100vh-8rem)] overflow-hidden p-5 lg:col-span-3">
                  {reportLoading ? (
                    <div className="flex h-full items-center justify-center text-subtle">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Loading report...
                    </div>
                  ) : reportContent ? (
                    <ReportViewer
                      key={selected.reportNumber}
                      application={selected}
                      content={reportContent}
                      onClose={() => {
                        setSelected(null);
                        setReportContent(null);
                      }}
                      onStatusChange={handleStatusChange}
                      onNotesChange={handleNotesChange}
                      onPdfGenerated={handlePdfGenerated}
                      states={states}
                      statusError={statusError}
                      statusUpdating={statusUpdating}
                    />
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}