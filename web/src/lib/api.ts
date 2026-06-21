import type {
  Application,
  DoctorData,
  FollowupsData,
  InterviewPrepFile,
  PatternsData,
  PipelineInbox,
  PipelineMetrics,
  PortalsData,
  ProfileData,
  ProgressMetrics,
  ScanHistoryData,
  ScriptResult,
  SortMode,
  StateOption,
  StatusFilter,
} from './types';

const API = '/api';
const API_TOKEN = import.meta.env.VITE_API_TOKEN || '';

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (API_TOKEN) {
    headers.set('Authorization', `Bearer ${API_TOKEN}`);
  }
  return headers;
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = typeof err.error === 'string' ? err.error : JSON.stringify(err.error ?? res.statusText);
    throw new Error(message || 'Request failed');
  }
  return res.json();
}

/** Authenticated fetch for mutating endpoints (matches server API_TOKEN). */
async function fetchMutating<T>(path: string, init?: RequestInit): Promise<T> {
  return fetchJSON<T>(path, {
    ...init,
    headers: buildHeaders(init),
  });
}

export function fetchApplications(filter: StatusFilter, sort: SortMode) {
  const params = new URLSearchParams({ filter, sort });
  return fetchJSON<{ applications: Application[]; metrics: PipelineMetrics }>(
    `/applications?${params}`,
  );
}

export function fetchProgress() {
  return fetchJSON<ProgressMetrics>('/progress');
}

export function fetchReport(reportNumber: string) {
  return fetchJSON<{ application: Application; content: string }>(`/reports/${reportNumber}`);
}

export function fetchStates() {
  return fetchJSON<StateOption[]>('/states');
}

export function updateStatus(reportNumber: string, status: string) {
  return fetchMutating<{ ok: boolean }>(`/applications/${reportNumber}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function updateNotes(reportNumber: string, notes: string) {
  return fetchMutating<{ ok: boolean }>(`/applications/${reportNumber}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });
}

export function fetchPipelineInbox() {
  return fetchJSON<PipelineInbox>('/pipeline-inbox');
}

export function addPipelineUrl(url: string) {
  return fetchMutating<PipelineInbox>('/pipeline-inbox', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export function removePipelineUrl(url: string) {
  return fetchMutating<PipelineInbox>('/pipeline-inbox', {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });
}

export function fetchFollowups() {
  return fetchJSON<FollowupsData>('/followups');
}

export function fetchPatterns() {
  return fetchJSON<PatternsData>('/patterns');
}

export function fetchDoctor() {
  return fetchJSON<DoctorData>('/doctor');
}

export function fetchVerify() {
  return fetchJSON<ScriptResult>('/verify');
}

export function fetchScanHistory() {
  return fetchJSON<ScanHistoryData>('/scan-history');
}

export function fetchProfile() {
  return fetchJSON<ProfileData>('/profile');
}

export function fetchPortals() {
  return fetchJSON<PortalsData>('/portals');
}

export function fetchInterviewPrepList() {
  return fetchJSON<{ files: InterviewPrepFile[] }>('/interview-prep');
}

export function fetchInterviewPrep(slug: string) {
  return fetchJSON<{ slug: string; content: string }>(`/interview-prep/${slug}`);
}

export function pdfUrl(filename: string) {
  return `${API}/output/${encodeURIComponent(filename)}`;
}

export function runScan() {
  return fetchMutating<ScriptResult>('/actions/scan', { method: 'POST' });
}

export function generatePdf(reportNumber: string) {
  return fetchMutating<ScriptResult>(`/actions/pdf/${reportNumber}`, { method: 'POST' });
}

export function runVerify() {
  return fetchMutating<ScriptResult>('/actions/verify', { method: 'POST' });
}

export function runNormalize() {
  return fetchMutating<ScriptResult>('/actions/normalize', { method: 'POST' });
}

export function runDedup() {
  return fetchMutating<ScriptResult>('/actions/dedup', { method: 'POST' });
}