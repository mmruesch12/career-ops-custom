import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, realpathSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname, resolve, relative, basename, sep } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { deriveNoteFields } from './derive.mjs';
import { acquireTrackerLock } from './tracker-lock.mjs';
import { resolveCvAbsolutePath, resolveCvRelativePath, cvFileExists } from '../../cv-path.mjs';
import { buildTitleFilter, classifyTitleTier } from '../../scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS_ROOT = resolve(__dirname, '../..');

const reReportLink = /\[(\d+)\]\(([^)]+)\)/;
const reScoreValue = /(\d+\.?\d*)\/5/;
const reArchetype = /\*\*(?:Arquetipo|Archetype)(?:\s+(?:detectado|detected))?\*\*\s*\|\s*(.+)/i;
const reTlDr = /\*\*TL;DR\*\*\s*\|\s*(.+)/i;
const reTlDrColon = /\*\*TL;DR:\*\*\s*(.+)/i;
const reRemote = /\*\*Remote\*\*\s*\|\s*(.+)/i;
const reComp = /\*\*Comp\*\*\s*\|\s*(.+)/i;
const reArchetypeColon = /\*\*(?:Arquetipo|Archetype):\*\*\s*(.+)/i;
const reArchetypeYAML = /^archetype:\s*"?([^"\n]+)"?\s*$/im;
const reReportURL = /^\*\*URL:\*\*\s*(https?:\/\/\S+)/im;
const reReportPDF = /^\*\*PDF:\*\*\s*(.+)/im;

const LEGACY_COLMAP = { num: 1, date: 2, company: 3, role: 4, score: 5, status: 6, pdf: 7, report: 8, notes: 9 };
const HEADER_ALIASES = {
  '#': 'num', num: 'num', date: 'date', company: 'company', empresa: 'company',
  role: 'role', puesto: 'role', location: 'location', score: 'score',
  status: 'status', pdf: 'pdf', report: 'report', notes: 'notes',
};

function assertInsideRepo(careerOpsPath, absolutePath) {
  const root = realpathSync(careerOpsPath);
  const resolved = existsSync(absolutePath) ? realpathSync(absolutePath) : resolve(absolutePath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new Error('Path outside career-ops root');
  }
  return resolved;
}

function resolveReportPath(careerOpsPath, trackerPath, link) {
  let resolved = resolve(dirname(trackerPath), link);
  if (!existsSync(resolved)) {
    const legacy = join(careerOpsPath, link);
    if (existsSync(legacy)) resolved = resolve(legacy);
  }
  assertInsideRepo(careerOpsPath, resolved);
  return relative(careerOpsPath, resolved);
}

export function resolveTrackerPath(careerOpsPath = CAREER_OPS_ROOT) {
  const dataPath = join(careerOpsPath, 'data', 'applications.md');
  if (existsSync(dataPath)) return dataPath;
  const rootPath = join(careerOpsPath, 'applications.md');
  if (existsSync(rootPath)) return rootPath;
  return null;
}

function detectColumns(lines) {
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((s) => s.trim().toLowerCase());
    if (!cells.includes('company') || !cells.includes('role')) continue;
    const map = {};
    cells.forEach((c, i) => {
      if (HEADER_ALIASES[c] != null) map[HEADER_ALIASES[c]] = i;
    });
    if (['num', 'company', 'role', 'score', 'status'].every((k) => map[k] != null)) return map;
  }
  return null;
}

function reportNumberFromCell(reportCell) {
  const m = String(reportCell || '').match(reReportLink);
  return m ? m[1] : null;
}

function writeTrackerFile(filePath, content) {
  if (existsSync(filePath)) {
    copyFileSync(filePath, `${filePath}.bak`);
  }
  writeFileSync(filePath, content);
}

async function withTrackerWrite(careerOpsPath, fn) {
  const filePath = resolveTrackerPath(careerOpsPath);
  if (!filePath) throw new Error('applications.md not found');
  const lock = await acquireTrackerLock(filePath);
  try {
    return fn(filePath);
  } finally {
    lock.release();
  }
}

function parseTableLine(line) {
  let fields;
  if (line.includes('\t')) {
    const trimmed = line.replace(/^\|/, '').trim();
    fields = trimmed.split('\t').map((p) => p.trim().replace(/^\||\|$/g, ''));
  } else {
    fields = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((p) => p.trim());
  }
  return fields;
}

export function normalizeStatus(raw) {
  let s = String(raw).replace(/\*\*/g, '').trim().toLowerCase();
  const dateIdx = s.indexOf(' 202');
  if (dateIdx > 0) s = s.slice(0, dateIdx).trim();

  if (s.includes('no aplicar') || s.includes('no_aplicar') || s === 'skip' || s.includes('geo blocker')) return 'skip';
  if (s.includes('interview') || s.includes('entrevista')) return 'interview';
  if (s === 'offer' || s.includes('oferta')) return 'offer';
  if (s.includes('responded') || s.includes('respondido')) return 'responded';
  if (s.includes('applied') || s.includes('aplicado') || ['enviada', 'aplicada', 'sent'].includes(s)) return 'applied';
  if (s.includes('rejected') || s.includes('rechazado') || s === 'rechazada') return 'rejected';
  if (
    s.includes('discarded') || s.includes('descartado') || ['descartada', 'cerrada', 'cancelada'].includes(s) ||
    s.startsWith('duplicado') || s.startsWith('dup')
  ) return 'discarded';
  if (
    s.includes('evaluated') || s.includes('evaluada') ||
    ['condicional', 'hold', 'monitor', 'evaluar', 'verificar'].includes(s)
  ) return 'evaluated';
  return s;
}

function statusPriority(status) {
  const norm = normalizeStatus(status);
  const order = ['interview', 'offer', 'responded', 'applied', 'evaluated', 'skip', 'rejected', 'discarded'];
  const idx = order.indexOf(norm);
  return idx === -1 ? 8 : idx;
}

function cleanTableCell(s) {
  return s.trim().replace(/\|$/, '').trim();
}

export function loadReportSummary(careerOpsPath, reportPath) {
  const fullPath = join(careerOpsPath, reportPath);
  if (!existsSync(fullPath)) return { archetype: '', tldr: '', remote: '', comp: '' };

  const text = readFileSync(fullPath, 'utf-8');
  let archetype = '';
  let tldr = '';
  let remote = '';
  let comp = '';

  const archetypeMatch = text.match(reArchetype) || text.match(reArchetypeColon) || text.match(reArchetypeYAML);
  if (archetypeMatch) archetype = cleanTableCell(archetypeMatch[1]);

  const tldrMatch = text.match(reTlDr) || text.match(reTlDrColon);
  if (tldrMatch) {
    tldr = cleanTableCell(tldrMatch[1]);
    if (tldr.length > 120) tldr = `${tldr.slice(0, 117)}...`;
  }

  const remoteMatch = text.match(reRemote);
  if (remoteMatch) remote = cleanTableCell(remoteMatch[1]);

  const compMatch = text.match(reComp);
  if (compMatch) comp = cleanTableCell(compMatch[1]);

  return { archetype, tldr, remote, comp };
}

export function parseApplications(careerOpsPath = CAREER_OPS_ROOT) {
  const filePath = resolveTrackerPath(careerOpsPath);
  if (!filePath) return [];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const colmap = detectColumns(lines) || LEGACY_COLMAP;
  const apps = [];
  let num = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('# ') || line.startsWith('|---') || line.startsWith('| #')) continue;
    if (!line.startsWith('|')) continue;

    const parts = line.split('|').map((s) => s.trim());
    const maxIdx = Math.max(...Object.values(colmap));
    if (parts.length <= maxIdx) continue;

    const trackerNumber = parseInt(parts[colmap.num], 10);
    if (isNaN(trackerNumber) || trackerNumber === 0) continue;
    num++;

    const app = {
      number: trackerNumber,
      date: parts[colmap.date] || '',
      company: parts[colmap.company] || '',
      role: parts[colmap.role] || '',
      status: parts[colmap.status] || '',
      statusNormalized: normalizeStatus(parts[colmap.status] || ''),
      scoreRaw: parts[colmap.score] || '',
      score: 0,
      hasPDF: (parts[colmap.pdf] || '').includes('✅'),
      reportNumber: '',
      reportPath: '',
      notes: colmap.notes != null ? (parts[colmap.notes] || '') : '',
      jobURL: '',
      location: colmap.location != null ? (parts[colmap.location] || '') : '',
      workMode: '',
      payRange: '',
      payMax: 0,
      paySource: '',
      lastContact: '',
      archetype: '',
      tldr: '',
      remote: '',
      compEstimate: '',
    };

    const scoreMatch = (parts[colmap.score] || '').match(reScoreValue);
    if (scoreMatch) app.score = parseFloat(scoreMatch[1]);

    const reportCell = parts[colmap.report] || '';
    const reportMatch = reportCell.match(reReportLink);
    if (reportMatch) {
      app.reportNumber = reportMatch[1];
      try {
        app.reportPath = resolveReportPath(careerOpsPath, filePath, reportMatch[2]);
      } catch {
        app.reportPath = '';
        app.reportNumber = '';
      }
    }

    deriveNoteFields(app);
    apps.push(app);
  }

  for (const app of apps) {
    if (!app.reportPath) continue;
    const fullReport = join(careerOpsPath, app.reportPath);
    if (!existsSync(fullReport)) continue;
    const header = readFileSync(fullReport, 'utf-8').slice(0, 1000);
    const urlMatch = header.match(reReportURL);
    if (urlMatch) app.jobURL = urlMatch[1];
  }

  return apps;
}

export function extractPdfPath(careerOpsPath, reportPath) {
  if (!reportPath) return '';
  const fullPath = join(careerOpsPath, reportPath);
  if (!existsSync(fullPath)) return '';
  const header = readFileSync(fullPath, 'utf-8').slice(0, 1500);
  const pdfMatch = header.match(reReportPDF);
  if (!pdfMatch) return '';
  const raw = pdfMatch[1].trim();
  if (raw.toLowerCase().includes('not generated')) return '';
  return raw.replace(/^output\//, '');
}

export function enrichApplications(apps, careerOpsPath = CAREER_OPS_ROOT) {
  return apps.map((app) => {
    if (!app.reportPath) return app;
    const summary = loadReportSummary(careerOpsPath, app.reportPath);
    const pdfPath = extractPdfPath(careerOpsPath, app.reportPath);
    return { ...app, ...summary, compEstimate: summary.comp, pdfPath };
  });
}

export function computeMetrics(apps) {
  const byStatus = {};
  let totalScore = 0;
  let scored = 0;
  let topScore = 0;
  let withPDF = 0;
  let actionable = 0;

  for (const app of apps) {
    const status = normalizeStatus(app.status);
    byStatus[status] = (byStatus[status] || 0) + 1;
    if (app.score > 0) {
      totalScore += app.score;
      scored++;
      if (app.score > topScore) topScore = app.score;
    }
    if (app.hasPDF) withPDF++;
    if (!['skip', 'rejected', 'discarded'].includes(status)) actionable++;
  }

  let topCount = 0;
  for (const app of apps) {
    if (app.score >= 4) topCount++;
  }

  return {
    total: apps.length,
    byStatus,
    avgScore: scored > 0 ? totalScore / scored : 0,
    topScore,
    topCount,
    withPDF,
    actionable,
  };
}

function safePct(part, whole) {
  return whole === 0 ? 0 : (part / whole) * 100;
}

function isoWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function computeProgressMetrics(apps) {
  const statusCounts = {};
  let totalScore = 0;
  let scored = 0;
  let topScore = 0;
  let totalOffers = 0;
  let activeApps = 0;

  for (const app of apps) {
    const norm = normalizeStatus(app.status);
    statusCounts[norm] = (statusCounts[norm] || 0) + 1;
    if (app.score > 0) {
      totalScore += app.score;
      scored++;
      if (app.score > topScore) topScore = app.score;
    }
    if (norm === 'offer') totalOffers++;
    if (!['skip', 'rejected', 'discarded'].includes(norm)) activeApps++;
  }

  const total = apps.length;
  const applied =
    (statusCounts.applied || 0) +
    (statusCounts.responded || 0) +
    (statusCounts.interview || 0) +
    (statusCounts.offer || 0) +
    (statusCounts.rejected || 0);
  const responded = (statusCounts.responded || 0) + (statusCounts.interview || 0) + (statusCounts.offer || 0);
  const interview = (statusCounts.interview || 0) + (statusCounts.offer || 0);
  const offer = statusCounts.offer || 0;

  const buckets = [0, 0, 0, 0, 0];
  for (const app of apps) {
    if (app.score <= 0) continue;
    if (app.score >= 4.5) buckets[0]++;
    else if (app.score >= 4.0) buckets[1]++;
    else if (app.score >= 3.5) buckets[2]++;
    else if (app.score >= 3.0) buckets[3]++;
    else buckets[4]++;
  }

  const weekCounts = {};
  for (const app of apps) {
    if (!app.date || !/^\d{4}-\d{2}-\d{2}$/.test(app.date)) continue;
    const key = isoWeek(app.date);
    weekCounts[key] = (weekCounts[key] || 0) + 1;
  }
  const weeks = Object.keys(weekCounts).sort().slice(-8);

  return {
    funnelStages: [
      { label: 'Evaluated', count: total, pct: 100 },
      { label: 'Applied', count: applied, pct: safePct(applied, total) },
      { label: 'Responded', count: responded, pct: safePct(responded, applied) },
      { label: 'Interview', count: interview, pct: safePct(interview, applied) },
      { label: 'Offer', count: offer, pct: safePct(offer, applied) },
    ],
    scoreBuckets: [
      { label: '4.5-5.0', count: buckets[0] },
      { label: '4.0-4.4', count: buckets[1] },
      { label: '3.5-3.9', count: buckets[2] },
      { label: '3.0-3.4', count: buckets[3] },
      { label: '<3.0', count: buckets[4] },
    ],
    weeklyActivity: weeks.map((week) => ({ week, count: weekCounts[week] })),
    responseRate: applied > 0 ? (responded / applied) * 100 : 0,
    interviewRate: applied > 0 ? (interview / applied) * 100 : 0,
    offerRate: applied > 0 ? (offer / applied) * 100 : 0,
    avgScore: scored > 0 ? totalScore / scored : 0,
    topScore,
    totalOffers,
    activeApps,
  };
}

export function sortApplications(apps, sortMode) {
  const sorted = [...apps];
  sorted.sort((a, b) => {
    switch (sortMode) {
      case 'date':
        return b.date.localeCompare(a.date);
      case 'company':
        return a.company.localeCompare(b.company);
      case 'status':
        return statusPriority(a.status) - statusPriority(b.status);
      case 'location':
        return (a.location || '').localeCompare(b.location || '');
      case 'pay':
        return (b.payMax || 0) - (a.payMax || 0);
      case 'last':
        return (b.lastContact || b.date).localeCompare(a.lastContact || a.date);
      case 'score':
      default:
        return b.score - a.score || b.date.localeCompare(a.date);
    }
  });
  return sorted;
}

export function filterApplications(apps, filter) {
  switch (filter) {
    case 'evaluated':
      return apps.filter((a) => normalizeStatus(a.status) === 'evaluated');
    case 'applied':
      return apps.filter((a) => normalizeStatus(a.status) === 'applied');
    case 'interview':
      return apps.filter((a) => ['interview', 'offer', 'responded'].includes(normalizeStatus(a.status)));
    case 'top':
      return apps.filter((a) => a.score >= 4);
    case 'skip':
      return apps.filter((a) => normalizeStatus(a.status) === 'skip');
    case 'rejected':
      return apps.filter((a) => normalizeStatus(a.status) === 'rejected');
    case 'discarded':
      return apps.filter((a) => normalizeStatus(a.status) === 'discarded');
    default:
      return apps;
  }
}

export function loadReport(careerOpsPath, reportPath) {
  const fullPath = join(careerOpsPath, reportPath);
  if (!existsSync(fullPath)) return null;
  try {
    assertInsideRepo(careerOpsPath, fullPath);
  } catch {
    return null;
  }
  return readFileSync(fullPath, 'utf-8');
}

const rePipelineUrl = /https?:\/\/[^\s)]+/;

export function extractUrlFromPipelineLine(line) {
  const urlMatch = line.match(rePipelineUrl);
  return urlMatch ? urlMatch[0] : null;
}

export function loadPipeline(careerOpsPath = CAREER_OPS_ROOT) {
  const path = join(careerOpsPath, 'data', 'pipeline.md');
  if (!existsSync(path)) return { content: '', pending: [] };
  const content = readFileSync(path, 'utf-8');
  const pending = [];
  for (const line of content.split('\n')) {
    const url = extractUrlFromPipelineLine(line);
    if (url) pending.push({ line: line.trim(), url });
  }
  return { content, pending };
}

export function validateNotesContent(notes) {
  if (typeof notes !== 'string') {
    throw new Error('notes must be a string');
  }
  if (notes.includes('|')) {
    throw new Error('Notes cannot contain pipe (|) characters — they break the applications table');
  }
  if (notes.includes('\n') || notes.includes('\r')) {
    throw new Error('Notes cannot contain line breaks — they break the applications table');
  }
  return notes;
}

const FALLBACK_STATES = [
  { id: 'evaluated', label: 'Evaluated' },
  { id: 'applied', label: 'Applied' },
  { id: 'responded', label: 'Responded' },
  { id: 'interview', label: 'Interview' },
  { id: 'offer', label: 'Offer' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'discarded', label: 'Discarded' },
  { id: 'skip', label: 'Skip' },
];

export function validateStatusValue(status, states = loadStates()) {
  if (typeof status !== 'string' || !status.trim()) {
    throw new Error('status must be a non-empty string');
  }
  const effectiveStates = states.length > 0 ? states : FALLBACK_STATES;
  const match = effectiveStates.find((s) => s.id === status || s.label === status);
  if (!match) {
    const allowed = effectiveStates.flatMap((s) => [s.id, s.label]);
    throw new Error(`Invalid status "${status}". Must be one of: ${allowed.join(', ')}`);
  }
  return match.label;
}

export function loadStates() {
  const path = join(CAREER_OPS_ROOT, 'templates', 'states.yml');
  if (!existsSync(path)) return [];
  const doc = yaml.load(readFileSync(path, 'utf-8'));
  return (doc?.states || []).map((s) => ({ id: s.id, label: s.label }));
}

export async function updateApplicationStatus(careerOpsPath, reportNumber, newStatus) {
  return withTrackerWrite(careerOpsPath, (filePath) => {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const colmap = detectColumns(lines) || LEGACY_COLMAP;
    let found = false;

    const updated = lines.map((line) => {
      if (!line.trim().startsWith('|') || line.includes('---')) return line;
      const parts = line.split('|').map((s) => s.trim());
      const maxIdx = Math.max(...Object.values(colmap));
      if (parts.length <= maxIdx) return line;
      if (reportNumberFromCell(parts[colmap.report]) !== String(reportNumber)) return line;

      parts[colmap.status] = newStatus;
      found = true;
      return `| ${parts.slice(1, -1).join(' | ')} |`;
    });

    if (!found) throw new Error(`Application with report ${reportNumber} not found`);
    writeTrackerFile(filePath, updated.join('\n'));
    return true;
  });
}

export function getCareerOpsRoot() {
  return CAREER_OPS_ROOT;
}

export async function updateApplicationNotes(careerOpsPath, reportNumber, newNotes) {
  const sanitized = validateNotesContent(newNotes);
  return withTrackerWrite(careerOpsPath, (filePath) => {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const colmap = detectColumns(lines) || LEGACY_COLMAP;
    if (colmap.notes == null) throw new Error('Tracker has no notes column');
    let found = false;

    const updated = lines.map((line) => {
      if (!line.trim().startsWith('|') || line.includes('---')) return line;
      const parts = line.split('|').map((s) => s.trim());
      const maxIdx = Math.max(...Object.values(colmap));
      if (parts.length <= maxIdx) return line;
      if (reportNumberFromCell(parts[colmap.report]) !== String(reportNumber)) return line;

      parts[colmap.notes] = sanitized;
      found = true;
      return `| ${parts.slice(1, -1).join(' | ')} |`;
    });

    if (!found) throw new Error(`Application with report ${reportNumber} not found`);
    writeTrackerFile(filePath, updated.join('\n'));
    return true;
  });
}

export function addPipelineUrl(careerOpsPath, url) {
  const trimmed = String(url).trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error('Invalid URL');

  const existing = loadPipeline(careerOpsPath);
  if (existing.pending.some((p) => p.url === trimmed)) {
    throw new Error('URL already in pipeline');
  }

  const path = join(careerOpsPath, 'data', 'pipeline.md');
  const dir = join(careerOpsPath, 'data');
  if (!existsSync(dir)) throw new Error('data/ directory not found');

  let content = '';
  if (existsSync(path)) {
    content = readFileSync(path, 'utf-8');
  } else {
    content = '# Pipeline Inbox\n\nPending URLs to evaluate:\n\n';
  }

  const line = `- ${trimmed}\n`;
  writeFileSync(path, content.endsWith('\n') ? content + line : content + '\n' + line);
  return loadPipeline(careerOpsPath);
}

export function removePipelineUrl(careerOpsPath, url) {
  const trimmed = String(url).trim();
  const path = join(careerOpsPath, 'data', 'pipeline.md');
  if (!existsSync(path)) throw new Error('pipeline.md not found');

  const lines = readFileSync(path, 'utf-8').split('\n');
  let found = false;
  const updated = lines.filter((line) => {
    const lineUrl = extractUrlFromPipelineLine(line);
    if (lineUrl === trimmed) {
      found = true;
      return false;
    }
    return true;
  });

  if (!found) throw new Error('URL not found in pipeline');
  writeFileSync(path, updated.join('\n'));
  return loadPipeline(careerOpsPath);
}

export function loadScanHistory(careerOpsPath = CAREER_OPS_ROOT) {
  const path = join(careerOpsPath, 'data', 'scan-history.tsv');
  if (!existsSync(path)) {
    return { entries: [], lastScanDate: null };
  }

  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('url\t') || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    entries.push({
      url: parts[0],
      firstSeen: parts[1] || '',
      portal: parts[2] || '',
      title: parts[3] || '',
      company: parts[4] || '',
      status: parts[5] || '',
      location: parts[6] || '',
    });
  }

  const dates = entries.map((e) => e.firstSeen).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    entries: entries.reverse(),
    lastScanDate: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}

export function loadProfile(careerOpsPath = CAREER_OPS_ROOT) {
  const profilePaths = [
    join(careerOpsPath, 'config', 'profile.yml'),
    join(careerOpsPath, 'profile.yml'),
  ];
  let profilePath = '';
  let profileContent = '';
  let profile = null;
  for (const p of profilePaths) {
    if (existsSync(p)) {
      profilePath = relative(careerOpsPath, p);
      profileContent = readFileSync(p, 'utf-8');
      try {
        profile = yaml.load(profileContent);
      } catch {
        profile = null;
      }
      break;
    }
  }

  let cvPath = '';
  let cvContent = '';
  if (cvFileExists(careerOpsPath)) {
    const cvAbs = resolveCvAbsolutePath(careerOpsPath);
    cvPath = relative(careerOpsPath, cvAbs);
    cvContent = readFileSync(cvAbs, 'utf-8');
  }

  return {
    profile: profile ? { path: profilePath, content: profileContent, parsed: profile } : null,
    cv: cvContent ? { path: cvPath, content: cvContent } : null,
    onboardingNeeded: !profileContent || !cvContent,
    missing: [
      ...(!profileContent ? ['config/profile.yml'] : []),
      ...(!cvContent ? ['cv.md'] : []),
    ],
  };
}

export function loadPortals(careerOpsPath = CAREER_OPS_ROOT) {
  const paths = [
    join(careerOpsPath, 'portals.yml'),
    join(careerOpsPath, 'config', 'portals.yml'),
    join(careerOpsPath, 'templates', 'portals.example.yml'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const content = readFileSync(p, 'utf-8');
      let parsed = null;
      try {
        parsed = yaml.load(content);
      } catch {
        parsed = null;
      }
      return { path: relative(careerOpsPath, p), content, parsed, exists: p.includes('portals.yml') && !p.includes('example') };
    }
  }
  return { path: '', content: '', parsed: null, exists: false };
}

export function listInterviewPrep(careerOpsPath = CAREER_OPS_ROOT) {
  const dir = join(careerOpsPath, 'interview-prep');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      slug: f.replace(/\.md$/, ''),
      filename: f,
      modified: statSync(join(dir, f)).mtime.toISOString(),
    }))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

export function loadInterviewPrep(careerOpsPath, slug) {
  const safe = basename(String(slug).replace(/\.md$/, ''));
  const path = join(careerOpsPath, 'interview-prep', `${safe}.md`);
  if (!existsSync(path)) return null;
  return { slug: safe, content: readFileSync(path, 'utf-8') };
}

export function safeOutputFile(careerOpsPath, filename) {
  const cleaned = String(filename).replace(/^output\//, '');
  const base = basename(cleaned);
  if (!base || base.includes('..') || cleaned.includes('/') || cleaned.includes('\\')) {
    throw new Error('Invalid filename');
  }

  const outputDir = join(careerOpsPath, 'output');
  mkdirSync(outputDir, { recursive: true });
  const realOutputDir = realpathSync(outputDir);
  const candidate = resolve(realOutputDir, base);
  if (candidate !== realOutputDir && !candidate.startsWith(realOutputDir + sep)) {
    throw new Error('Path traversal detected');
  }
  return candidate;
}

export function validateHtmlSource(careerOpsPath, htmlPath) {
  if (!htmlPath || !existsSync(htmlPath)) return null;
  const outputDir = join(careerOpsPath, 'output');
  mkdirSync(outputDir, { recursive: true });
  const allowedRoots = [realpathSync(outputDir), realpathSync('/tmp')];
  const resolved = realpathSync(htmlPath);
  for (const root of allowedRoots) {
    if (resolved === root || resolved.startsWith(root + sep)) return resolved;
  }
  throw new Error('HTML source must be under output/ or /tmp');
}

const DEFAULT_MATCH_MIN_SCORE = 4.0;
const DISCOVERY_LOOKBACK_DAYS = 14;
const MAX_CV_BYTES = 256 * 1024;

function loadMatchMinScore(careerOpsPath = CAREER_OPS_ROOT) {
  const profilePaths = [
    join(careerOpsPath, 'config', 'profile.yml'),
    join(careerOpsPath, 'profile.yml'),
  ];
  for (const p of profilePaths) {
    if (!existsSync(p)) continue;
    try {
      const doc = yaml.load(readFileSync(p, 'utf-8'));
      const raw = doc?.matching?.min_score ?? doc?.matching?.minScore;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_MATCH_MIN_SCORE;
}

function normalizeMatchUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(String(url).trim());
    return `${u.origin}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).trim().replace(/\/$/, '').toLowerCase();
  }
}

function daysAgoIso(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function normalizeCompanyRoleKey(company, role) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${norm(company)}::${norm(role)}`;
}

export function getResumePrerequisites(careerOpsPath = CAREER_OPS_ROOT) {
  const cvPath = cvFileExists(careerOpsPath) ? resolveCvRelativePath(careerOpsPath) : null;
  let hasCv = false;
  if (cvPath) {
    const content = readFileSync(join(careerOpsPath, cvPath), 'utf-8').trim();
    hasCv = content.length > 0;
  }
  const hasXaiKey = Boolean(process.env.XAI_API_KEY?.trim());
  return {
    hasCv,
    hasXaiKey,
    cvPath,
    canGenerateResume: hasCv && hasXaiKey,
  };
}

export function getEvaluatePrerequisites(careerOpsPath = CAREER_OPS_ROOT) {
  const resume = getResumePrerequisites(careerOpsPath);
  return {
    ...resume,
    canEvaluate: resume.canGenerateResume,
  };
}

export function computeMatches(careerOpsPath = CAREER_OPS_ROOT) {
  const minScore = loadMatchMinScore(careerOpsPath);
  const apps = enrichApplications(parseApplications(careerOpsPath), careerOpsPath);

  const evaluatedMatches = apps
    .filter((app) => {
      if (normalizeStatus(app.status) !== 'evaluated' || app.score < minScore) return false;
      if (!app.reportNumber || !app.reportPath) return false;
      return existsSync(join(careerOpsPath, app.reportPath));
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score)
    .map((app) => ({
      reportNumber: app.reportNumber,
      number: app.number,
      date: app.date,
      company: app.company,
      role: app.role,
      score: app.score,
      scoreRaw: app.scoreRaw,
      tldr: app.tldr,
      archetype: app.archetype,
      jobURL: app.jobURL,
      hasPDF: app.hasPDF,
      pdfPath: app.pdfPath || '',
      reportPath: app.reportPath,
      remote: app.remote,
      compEstimate: app.compEstimate,
    }));

  const knownUrls = new Set();
  const knownCompanyRoles = new Set();
  for (const app of apps) {
    const normalized = normalizeMatchUrl(app.jobURL);
    if (normalized) knownUrls.add(normalized);
    const cr = normalizeCompanyRoleKey(app.company, app.role);
    if (cr !== '::') knownCompanyRoles.add(cr);
  }

  const pipeline = loadPipeline(careerOpsPath);
  for (const item of pipeline.pending) {
    const normalized = normalizeMatchUrl(item.url);
    if (normalized) knownUrls.add(normalized);
  }

  const cutoff = daysAgoIso(DISCOVERY_LOOKBACK_DAYS);
  const scan = loadScanHistory(careerOpsPath);
  const portalsDoc = loadPortals(careerOpsPath);
  const profileDoc = loadProfile(careerOpsPath);
  const titleFilterConfig = portalsDoc.exists ? portalsDoc.parsed?.title_filter : null;
  const titleFilter = titleFilterConfig ? buildTitleFilter(titleFilterConfig) : () => true;
  const profile = profileDoc.profile?.parsed ?? null;

  const baseDiscoveries = scan.entries
    .filter((entry) => entry.firstSeen && entry.firstSeen >= cutoff)
    .filter((entry) => {
      const normalized = normalizeMatchUrl(entry.url);
      if (normalized && knownUrls.has(normalized)) return false;
      const cr = normalizeCompanyRoleKey(entry.company, entry.title);
      if (cr !== '::' && knownCompanyRoles.has(cr)) return false;
      if (entry.status && /evaluated|applied|duplicate/i.test(entry.status)) return false;
      return true;
    })
    .map((entry) => ({
      title: entry.title,
      company: entry.company,
      url: entry.url,
      firstSeen: entry.firstSeen,
      portal: entry.portal,
      location: entry.location,
      status: entry.status,
    }));

  const filteredDiscoveries = baseDiscoveries.filter((entry) => titleFilter(entry.title));

  const tierADiscoveries = [];
  const recentDiscoveries = [];
  for (const entry of filteredDiscoveries) {
    if (classifyTitleTier(entry.title, titleFilterConfig, profile) === 'A') {
      tierADiscoveries.push(entry);
    } else {
      recentDiscoveries.push(entry);
    }
  }

  return {
    minScore,
    evaluatedMatches,
    tierADiscoveries,
    recentDiscoveries,
    prerequisites: getEvaluatePrerequisites(careerOpsPath),
    generatedAt: new Date().toISOString(),
  };
}

export function saveCv(careerOpsPath, content) {
  if (typeof content !== 'string') {
    throw new Error('content must be a string');
  }
  if (!content.trim()) {
    throw new Error('CV content cannot be empty');
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_CV_BYTES) {
    throw new Error(`CV exceeds maximum size of ${MAX_CV_BYTES} bytes`);
  }

  const target = resolveCvAbsolutePath(careerOpsPath);
  assertInsideRepo(careerOpsPath, target);
  if (existsSync(target)) {
    copyFileSync(target, `${target}.bak`);
  }
  writeFileSync(target, content, 'utf-8');
  return { path: relative(careerOpsPath, target), bytes: Buffer.byteLength(content, 'utf8') };
}

export function updateReportPdfPath(careerOpsPath, reportPath, pdfFilename) {
  if (!reportPath || !pdfFilename) return false;
  const fullPath = join(careerOpsPath, reportPath);
  assertInsideRepo(careerOpsPath, fullPath);
  if (!existsSync(fullPath)) return false;

  const safeName = basename(String(pdfFilename));
  if (!safeName.endsWith('.pdf') || safeName.includes('..')) return false;

  const pdfLine = `**PDF:** output/${safeName}`;
  let content = readFileSync(fullPath, 'utf-8');
  if (reReportPDF.test(content)) {
    content = content.replace(reReportPDF, pdfLine);
  } else {
    const headerEnd = content.indexOf('\n---\n');
    const insertAt = headerEnd > 0 ? headerEnd : content.length;
    const prefix = content.slice(0, insertAt).trimEnd();
    const suffix = content.slice(insertAt);
    content = `${prefix}\n${pdfLine}${suffix.startsWith('\n') ? '' : '\n'}${suffix}`;
  }
  writeFileSync(fullPath, content, 'utf-8');
  return true;
}

export async function updateApplicationPdf(careerOpsPath, reportNumber, pdfEmoji = '✅') {
  return withTrackerWrite(careerOpsPath, (filePath) => {
    const lines = readFileSync(filePath, 'utf-8').split('\n');
    const colmap = detectColumns(lines) || LEGACY_COLMAP;
    if (colmap.pdf == null) throw new Error('Tracker has no PDF column');
    let found = false;

    const updated = lines.map((line) => {
      if (!line.trim().startsWith('|') || line.includes('---')) return line;
      const parts = line.split('|').map((s) => s.trim());
      const maxIdx = Math.max(...Object.values(colmap));
      if (parts.length <= maxIdx) return line;
      if (reportNumberFromCell(parts[colmap.report]) !== String(reportNumber)) return line;

      parts[colmap.pdf] = pdfEmoji;
      found = true;
      return `| ${parts.slice(1, -1).join(' | ')} |`;
    });

    if (!found) throw new Error(`Application with report ${reportNumber} not found`);
    writeTrackerFile(filePath, updated.join('\n'));
    return true;
  });
}

export function findHtmlForPdf(careerOpsPath, pdfPath, reportPath) {
  const candidates = [];
  if (pdfPath) {
    const pdfBase = basename(pdfPath, '.pdf');
    candidates.push(join(careerOpsPath, 'output', `${pdfBase}.html`));
    candidates.push(join('/tmp', `${pdfBase}.html`));
  }
  if (reportPath) {
    const slug = basename(reportPath, '.md').replace(/^\d+-/, '');
    candidates.push(join('/tmp', `cv-candidate-${slug}.html`));
    const parts = slug.split('-');
    if (parts.length > 0) {
      candidates.push(join('/tmp', `cv-candidate-${parts[0]}.html`));
    }
  }
  for (const c of candidates) {
    try {
      return validateHtmlSource(careerOpsPath, c);
    } catch {
      // try next candidate
    }
  }
  return null;
}