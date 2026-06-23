export type AppView =
  | 'matches'
  | 'pipeline'
  | 'progress'
  | 'inbox'
  | 'followups'
  | 'patterns'
  | 'scan'
  | 'profile'
  | 'commands';

export type StatusFilter =
  | 'all'
  | 'evaluated'
  | 'applied'
  | 'interview'
  | 'top'
  | 'skip'
  | 'rejected'
  | 'discarded';

export type SortMode = 'score' | 'date' | 'company' | 'status' | 'location' | 'pay' | 'last';

export interface Application {
  number: number;
  date: string;
  company: string;
  role: string;
  status: string;
  statusNormalized: string;
  scoreRaw: string;
  score: number;
  hasPDF: boolean;
  reportNumber: string;
  reportPath: string;
  notes: string;
  jobURL: string;
  location: string;
  workMode: string;
  payRange: string;
  payMax: number;
  paySource: string;
  lastContact: string;
  archetype: string;
  tldr: string;
  remote: string;
  compEstimate: string;
  pdfPath?: string;
}

export interface PipelineMetrics {
  total: number;
  byStatus: Record<string, number>;
  avgScore: number;
  topScore: number;
  topCount: number;
  withPDF: number;
  actionable: number;
}

export interface FunnelStage {
  label: string;
  count: number;
  pct: number;
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface WeekActivity {
  week: string;
  count: number;
}

export interface ProgressMetrics {
  funnelStages: FunnelStage[];
  scoreBuckets: ScoreBucket[];
  weeklyActivity: WeekActivity[];
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  avgScore: number;
  topScore: number;
  totalOffers: number;
  activeApps: number;
}

export interface StateOption {
  id: string;
  label: string;
}

export interface PipelineInbox {
  content: string;
  pending: { line: string; url: string }[];
  prerequisites?: ResumePrerequisites;
}

export interface FollowupContact {
  name?: string;
  email?: string;
  linkedin?: string;
  role?: string;
}

export interface FollowupEntry {
  num: number;
  date: string;
  appliedDate: string;
  company: string;
  role: string;
  status: string;
  score: number;
  notes: string;
  reportPath: string;
  contacts: FollowupContact[];
  daysSinceApplication: number;
  daysSinceLastFollowup: number | null;
  followupCount: number;
  urgency: 'urgent' | 'overdue' | 'waiting' | 'cold';
  nextFollowupDate: string | null;
  daysUntilNext: number | null;
}

export interface FollowupsData {
  metadata?: {
    analysisDate: string;
    totalTracked: number;
    actionable: number;
    overdue: number;
    urgent: number;
    cold: number;
    waiting: number;
  };
  entries?: FollowupEntry[];
  cadenceConfig?: Record<string, number>;
  error?: string;
}

export interface BreakdownItem {
  total: number;
  positive: number;
  negative: number;
  self_filtered: number;
  pending: number;
  conversionRate: number;
}

export interface ArchetypeBreakdown extends BreakdownItem {
  archetype: string;
}

export interface RemotePolicyItem extends BreakdownItem {
  policy: string;
}

export interface PatternsData {
  metadata?: {
    total: number;
    dateRange: { from: string; to: string };
    analysisDate: string;
    byOutcome: Record<string, number>;
  };
  funnel?: Record<string, number>;
  scoreComparison?: Record<string, { avg: number; min: number; max: number; count: number }>;
  archetypeBreakdown?: ArchetypeBreakdown[];
  blockerAnalysis?: { blocker: string; frequency: number; percentage: number }[];
  remotePolicy?: RemotePolicyItem[];
  companySizeBreakdown?: ({ size: string } & BreakdownItem)[];
  scoreThreshold?: { recommended: number; reasoning: string; positiveRange: string };
  techStackGaps?: { skill: string; frequency: number }[];
  recommendations?: { action: string; reasoning: string; impact: string }[];
  error?: string;
  current?: number;
  threshold?: number;
}

export interface ScanHistoryEntry {
  url: string;
  firstSeen: string;
  portal: string;
  title: string;
  company: string;
  status: string;
  location: string;
}

export interface ScanHistoryData {
  entries: ScanHistoryEntry[];
  lastScanDate: string | null;
}

export interface ProfileData {
  profile: { path: string; content: string; parsed: Record<string, unknown> } | null;
  cv: { path: string; content: string } | null;
  onboardingNeeded: boolean;
  missing: string[];
}

export interface DoctorData {
  onboardingNeeded: boolean;
  missing: string[];
  warnings: string[];
  exitCode?: number;
  stderr?: string;
}

export interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  outputPath?: string;
  error?: string;
  hint?: string;
}

export interface InterviewPrepFile {
  slug: string;
  filename: string;
  modified: string;
}

export interface PortalsData {
  path: string;
  content: string;
  parsed: Record<string, unknown> | null;
  exists: boolean;
}

export interface EvaluatedMatch {
  reportNumber: string;
  number: number;
  date: string;
  company: string;
  role: string;
  score: number;
  scoreRaw: string;
  tldr: string;
  archetype: string;
  jobURL: string;
  hasPDF: boolean;
  pdfPath: string;
  reportPath: string;
  remote: string;
  compEstimate: string;
}

export interface RecentDiscovery {
  title: string;
  company: string;
  url: string;
  firstSeen: string;
  portal: string;
  location: string;
  status: string;
}

export interface ResumePrerequisites {
  hasCv: boolean;
  hasXaiKey: boolean;
  cvPath: string | null;
  canGenerateResume: boolean;
  canEvaluate?: boolean;
}

export interface MatchData {
  minScore: number;
  evaluatedMatches: EvaluatedMatch[];
  tierADiscoveries: RecentDiscovery[];
  recentDiscoveries: RecentDiscovery[];
  prerequisites: ResumePrerequisites;
  generatedAt: string;
}

export interface ResumeGenerationResult {
  ok: boolean;
  pdfFilename?: string;
  downloadUrl?: string;
  company?: string;
  role?: string;
  trackerUpdated?: boolean;
  reportUpdated?: boolean;
  error?: string;
  hint?: string;
}

export interface EvaluateResult {
  ok: boolean;
  reportNumber?: string;
  reportPath?: string;
  score?: number | string;
  company?: string;
  role?: string;
  removedFromPipeline?: boolean;
  error?: string;
  hint?: string;
}

export interface CommandCard {
  id: string;
  title: string;
  description: string;
  cli: string;
  category: 'ai' | 'script' | 'view';
  view?: AppView;
  action?: string;
}