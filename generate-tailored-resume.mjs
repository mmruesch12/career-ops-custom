#!/usr/bin/env node
/**
 * generate-tailored-resume.mjs — xAI Grok-powered tailored resume + PDF
 *
 * Usage:
 *   node generate-tailored-resume.mjs --report <reportNumber>
 *   node generate-tailored-resume.mjs --report-path reports/004-retool-senior-ai-engineer.md
 *
 * Requires: XAI_API_KEY in .env, cv.md (or data/cv.md)
 * Model: XAI_MODEL (default grok-4-1-fast-reasoning)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from 'fs';
import { join, dirname, relative, resolve, sep, basename } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { resolveCvAbsolutePath, cvFileExists } from './cv-path.mjs';

try {
  const { config } = await import('dotenv');
  config({ quiet: true });
} catch {
  // dotenv optional
}

import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const XAI_BASE_URL = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
const MODEL = process.env.XAI_MODEL || 'grok-4-1-fast-reasoning';

async function callXaiChat(prompt) {
  const apiKey = process.env.XAI_API_KEY;
  const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.35,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const body = await res.text();
  if (!res.ok) {
    let detail = body.slice(0, 400);
    try {
      const parsed = JSON.parse(body);
      detail = parsed.error?.message || parsed.message || detail;
    } catch {
      // keep raw snippet
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error('xAI returned non-JSON response');
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('xAI returned empty completion');
  }
  return content;
}

function redactSecrets(message) {
  let out = String(message || '');
  if (process.env.XAI_API_KEY) {
    out = out.replaceAll(process.env.XAI_API_KEY, '[REDACTED]');
  }
  return out;
}

const PATHS = {
  profileYml: join(ROOT, 'config', 'profile.yml'),
  profileMd: join(ROOT, 'modes', '_profile.md'),
  pdfMode: join(ROOT, 'modes', 'pdf.md'),
  articleDigest: join(ROOT, 'article-digest.md'),
  template: join(ROOT, 'templates', 'cv-template.html'),
  tracker: join(ROOT, 'data', 'applications.md'),
  reports: join(ROOT, 'reports'),
  output: join(ROOT, 'output'),
};

function emit(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(exitCode);
}

function fail(error, exitCode = 1) {
  emit({ ok: false, error: String(error) }, exitCode);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

function readOptional(path, label) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8').trim();
}

function parseArgs(argv) {
  let reportNumber = '';
  let reportPath = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--report' && argv[i + 1]) {
      reportNumber = String(argv[++i]).trim();
    } else if (argv[i] === '--report-path' && argv[i + 1]) {
      reportPath = String(argv[++i]).trim();
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stderr.write(`Usage: node generate-tailored-resume.mjs --report <n>\n`);
      process.stderr.write(`       node generate-tailored-resume.mjs --report-path <relative-path>\n`);
      process.exit(0);
    }
  }
  return { reportNumber, reportPath };
}

function findReportByNumber(num) {
  const padded = String(num).padStart(3, '0');
  if (existsSync(PATHS.reports)) {
    const match = readdirSync(PATHS.reports)
      .filter((f) => f.startsWith(`${padded}-`) && f.endsWith('.md'))
      .sort()[0];
    if (match) return join(PATHS.reports, match);
  }
  if (existsSync(PATHS.tracker)) {
    const content = readFileSync(PATHS.tracker, 'utf-8');
    const linkRe = new RegExp(`\\[${padded}\\]\\(([^)]+)\\)`);
    const m = content.match(linkRe);
    if (m) {
      const link = m[1].replace(/^\.\.\//, '');
      const candidate = resolve(ROOT, 'data', link);
      if (existsSync(candidate)) return assertInsideRepo(candidate);
      const alt = resolve(ROOT, link);
      if (existsSync(alt)) return assertInsideRepo(alt);
    }
  }
  return null;
}

function assertInsideRepo(absolutePath) {
  const root = realpathSync(ROOT);
  const resolved = existsSync(absolutePath) ? realpathSync(absolutePath) : resolve(absolutePath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    fail('report-path must stay inside repo root');
  }
  return resolved;
}

function resolveReportPath({ reportNumber, reportPath }) {
  if (reportPath) {
    const resolved = resolve(ROOT, reportPath);
    assertInsideRepo(resolved);
    if (!existsSync(resolved)) fail(`Report not found: ${reportPath}`);
    return resolved;
  }
  if (!reportNumber || !/^\d+$/.test(reportNumber)) {
    fail('Provide --report <number> or --report-path <relative-path>');
  }
  const found = findReportByNumber(reportNumber);
  if (!found) fail(`No report found for number ${reportNumber}`);
  return found;
}

function extractReportMeta(reportText) {
  const header = reportText.slice(0, 2500);
  const titleMatch = reportText.match(/^#\s*Evaluation:\s*(.+?)\s*[—–-]\s*(.+)/m);
  const company = titleMatch?.[1]?.trim()
    || header.match(/^\*\*Company:\*\*\s*(.+)/im)?.[1]?.trim()
    || header.match(/COMPANY:\s*(.+)/im)?.[1]?.trim()
    || 'unknown';
  const role = titleMatch?.[2]?.trim()
    || header.match(/^\*\*Role:\*\*\s*(.+)/im)?.[1]?.trim()
    || header.match(/ROLE:\s*(.+)/im)?.[1]?.trim()
    || 'unknown';
  const url = header.match(/^\*\*URL:\*\*\s*(https?:\/\/\S+)/im)?.[1]?.trim() || '';
  const score = header.match(/^\*\*Score:\*\*\s*([0-9.]+)/im)?.[1] || '';
  return { company, role, url, score };
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`.replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/$/, '');
  }
}

function fillTemplate(template, values) {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.split(`{{${key}}}`).join(value ?? '');
  }
  if (!values.PHONE) {
    html = html.replace(/<span>\{\{PHONE\}\}<\/span>\s*<span class="separator">\|<\/span>\s*/g, '');
    html = html.replace(/<span><\/span>\s*<span class="separator">\|<\/span>\s*/g, '');
  }
  return html;
}

function stripJsonFence(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

const HTML_PLACEHOLDER_KEYS = new Set([
  'COMPETENCIES', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'SKILLS',
]);

const UNSAFE_HTML_RE = /<script\b|javascript:|onerror\s*=|onload\s*=|<iframe\b|data:text\/html/i;

function sanitizePlaceholderHtml(value, fieldName) {
  const text = String(value ?? '');
  if (UNSAFE_HTML_RE.test(text)) {
    throw new Error(`Unsafe HTML detected in ${fieldName}`);
  }
  return text;
}

function extractCvAnchors(cvText) {
  const companies = [];
  for (const line of cvText.split('\n')) {
    const heading = line.match(/^###\s+(.+)/);
    if (heading) companies.push(heading[1].toLowerCase());
    const bold = line.match(/\*\*([^*]{3,})\*\*/);
    if (bold) companies.push(bold[1].toLowerCase());
  }
  const tokens = new Set(
    (cvText.toLowerCase().match(/\b[a-z][a-z0-9]{3,}\b/g) || []).filter((t) => t.length >= 4),
  );
  return { companies, tokens };
}

function validateContentAgainstCv(placeholders, cvText) {
  const anchors = extractCvAnchors(cvText);
  const combined = [
    placeholders.SUMMARY_TEXT,
    placeholders.EXPERIENCE,
    placeholders.PROJECTS,
    placeholders.SKILLS,
  ].join(' ').toLowerCase();

  const minHits = cvText.length < 800 ? 3 : 8;
  let tokenHits = 0;
  for (const token of anchors.tokens) {
    if (combined.includes(token)) {
      tokenHits++;
      if (tokenHits >= minHits) break;
    }
  }
  if (tokenHits < minHits) {
    throw new Error('Tailored content has insufficient overlap with cv.md — possible hallucination');
  }

  if (anchors.companies.length > 0) {
    const experience = String(placeholders.EXPERIENCE || '').toLowerCase();
    const companyHits = anchors.companies.filter((c) => c.length > 3 && experience.includes(c.slice(0, 12)));
    if (companyHits.length === 0) {
      throw new Error('Work experience does not reference any employers from cv.md');
    }
  }
}

const OPTIONAL_CONTENT_KEYS = [
  'CERTIFICATIONS', 'SECTION_CERTIFICATIONS', 'PROJECTS', 'SECTION_PROJECTS',
  'EDUCATION', 'SECTION_EDUCATION', 'PHONE', 'LOCATION',
];

function applyContentDefaults(placeholders) {
  for (const key of OPTIONAL_CONTENT_KEYS) {
    if (placeholders[key] == null || !String(placeholders[key]).trim()) {
      if (key.startsWith('SECTION_')) {
        placeholders[key] = key.replace('SECTION_', '').replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      } else {
        placeholders[key] = '';
      }
    }
  }
}

function applyContactDefaults(placeholders, contact) {
  if (!placeholders.NAME?.trim()) placeholders.NAME = contact.name;
  if (!placeholders.EMAIL?.trim()) placeholders.EMAIL = contact.email;
  if (!placeholders.PHONE?.trim()) placeholders.PHONE = contact.phone;
  if (!placeholders.LOCATION?.trim()) placeholders.LOCATION = contact.location;
  if (!placeholders.LINKEDIN_URL?.trim() && contact.linkedinUrl) {
    placeholders.LINKEDIN_URL = contact.linkedinUrl;
    placeholders.LINKEDIN_DISPLAY = contact.linkedin.replace(/^https?:\/\//, '');
  }
  if (!placeholders.PORTFOLIO_URL?.trim() && contact.portfolioUrl) {
    placeholders.PORTFOLIO_URL = contact.portfolioUrl;
    placeholders.PORTFOLIO_DISPLAY = contact.portfolio.replace(/^https?:\/\//, '');
  }
  for (const key of ['EMAIL', 'LINKEDIN_URL', 'LINKEDIN_DISPLAY', 'PORTFOLIO_URL', 'PORTFOLIO_DISPLAY', 'PHONE']) {
    if (placeholders[key] == null) placeholders[key] = '';
  }
}

function validatePlaceholders(data, cvText) {
  const required = [
    'LANG', 'PAGE_WIDTH', 'NAME', 'SECTION_SUMMARY', 'SUMMARY_TEXT',
    'SECTION_COMPETENCIES', 'COMPETENCIES', 'SECTION_EXPERIENCE', 'EXPERIENCE',
    'SECTION_PROJECTS', 'PROJECTS', 'SECTION_EDUCATION', 'EDUCATION',
    'SECTION_SKILLS', 'SKILLS',
  ];
  const missing = required.filter((k) => !data[k] || !String(data[k]).trim());
  if (missing.length > 0) {
    throw new Error(`xAI response missing placeholders: ${missing.join(', ')}`);
  }

  for (const key of HTML_PLACEHOLDER_KEYS) {
    data[key] = sanitizePlaceholderHtml(data[key], key);
  }

  validateContentAgainstCv(data, cvText);
}

function profileContact(profile) {
  const candidate = profile?.candidate || {};
  const phone = String(candidate.phone || '').trim();
  const linkedin = String(candidate.linkedin || '').trim();
  const portfolio = String(candidate.portfolio_url || candidate.portfolio || '').trim();
  const linkedinUrl = linkedin
    ? (linkedin.startsWith('http') ? linkedin : `https://${linkedin}`)
    : '';
  const portfolioUrl = portfolio
    ? (portfolio.startsWith('http') ? portfolio : `https://${portfolio}`)
    : '';
  return {
    name: String(candidate.full_name || candidate.name || 'Candidate').trim(),
    email: String(candidate.email || '').trim(),
    phone,
    location: String(candidate.location || '').trim(),
    linkedin,
    linkedinUrl,
    portfolio,
    portfolioUrl,
  };
}

const { reportNumber, reportPath } = parseArgs(process.argv.slice(2));

if (!process.env.XAI_API_KEY?.trim()) {
  fail('XAI_API_KEY not found. Add it to .env (get a key at https://console.x.ai/)');
}

if (!cvFileExists(ROOT)) {
  fail('cv.md not found (checked cv.md and data/cv.md). Create your default resume first.');
}

const cvPath = resolveCvAbsolutePath(ROOT);
const cvContent = readFileSync(cvPath, 'utf-8').trim();
if (!cvContent) {
  fail('CV file is empty. Add content to cv.md before generating a tailored resume.');
}
const profileYmlRaw = readOptional(PATHS.profileYml, 'config/profile.yml');
let profile = {};
if (profileYmlRaw) {
  try {
    profile = yaml.load(profileYmlRaw) || {};
  } catch (err) {
    fail(`Invalid config/profile.yml: ${err.message}`);
  }
}
const profileMd = readOptional(PATHS.profileMd, 'modes/_profile.md');
const articleDigest = readOptional(PATHS.articleDigest, 'article-digest.md');
const pdfRules = readOptional(PATHS.pdfMode, 'modes/pdf.md');
const template = readFileSync(PATHS.template, 'utf-8');

const resolvedReport = resolveReportPath({ reportNumber, reportPath });
const reportContent = readFileSync(resolvedReport, 'utf-8');
const reportMeta = extractReportMeta(reportContent);
const contact = profileContact(profile);
const candidateSlug = slugify(contact.name);
const companySlug = slugify(reportMeta.company);
const today = new Date().toISOString().split('T')[0];

const systemPrompt = `You are career-ops, tailoring a candidate's resume for a specific job offer.

Follow the PDF generation rules exactly:

═══════════════════════════════════════════════════════
PDF MODE RULES (modes/pdf.md)
═══════════════════════════════════════════════════════
${pdfRules}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md) — SOURCE OF TRUTH
═══════════════════════════════════════════════════════
${cvContent}

═══════════════════════════════════════════════════════
CANDIDATE PROFILE (config/profile.yml)
═══════════════════════════════════════════════════════
${profileYmlRaw || '(not provided)'}

═══════════════════════════════════════════════════════
USER ARCHETYPES & NARRATIVE (modes/_profile.md)
═══════════════════════════════════════════════════════
${profileMd || '(not provided)'}

${articleDigest ? `═══════════════════════════════════════════════════════
ARTICLE DIGEST (proof points)
═══════════════════════════════════════════════════════
${articleDigest}` : ''}

═══════════════════════════════════════════════════════
EVALUATION REPORT (JD context + requirements)
═══════════════════════════════════════════════════════
${reportContent}

═══════════════════════════════════════════════════════
OUTPUT INSTRUCTIONS
═══════════════════════════════════════════════════════
1. NEVER invent skills, metrics, employers, or degrees — only reword real experience from cv.md.
2. Inject JD keywords naturally from the evaluation report (Block B requirements, role summary).
3. Detect CV language from JD (default English). Set LANG to a BCP-47 code (e.g. en, de, fr, ja, ar).
4. Detect paper format: US/Canada → PAGE_WIDTH "8.5in" and pageFormat "letter"; otherwise PAGE_WIDTH "210mm" and pageFormat "a4".
5. Return ONLY valid JSON (no markdown fences) with this shape:
{
  "pageFormat": "letter" | "a4",
  "placeholders": {
    "LANG": "...",
    "PAGE_WIDTH": "...",
    "NAME": "${contact.name.replace(/"/g, '\\"')}",
    "PHONE": "${contact.phone.replace(/"/g, '\\"')}",
    "EMAIL": "${contact.email.replace(/"/g, '\\"')}",
    "LINKEDIN_URL": "...",
    "LINKEDIN_DISPLAY": "...",
    "PORTFOLIO_URL": "...",
    "PORTFOLIO_DISPLAY": "...",
    "LOCATION": "...",
    "SECTION_SUMMARY": "Professional Summary",
    "SUMMARY_TEXT": "3-4 lines, keyword-dense summary",
    "SECTION_COMPETENCIES": "Core Competencies",
    "COMPETENCIES": "<span class=\\"competency-tag\\">keyword</span> repeated 6-8 times",
    "SECTION_EXPERIENCE": "Work Experience",
    "EXPERIENCE": "HTML for jobs using .job, .job-header, .job-company, .job-period, .job-role, .job-location, ul/li",
    "SECTION_PROJECTS": "Projects",
    "PROJECTS": "HTML for top 3-4 projects using .project, .project-title, .project-desc",
    "SECTION_EDUCATION": "Education",
    "EDUCATION": "HTML using .edu-item blocks",
    "SECTION_CERTIFICATIONS": "Certifications",
    "CERTIFICATIONS": "HTML cert rows",
    "SECTION_SKILLS": "Skills",
    "SKILLS": "HTML skill categories"
  }
}
6. Use contact data from profile.yml for header fields. If phone is empty, set PHONE to empty string.
7. LINKEDIN_URL and PORTFOLIO_URL must be full https URLs when present.
`;

process.stderr.write(`Tailoring resume for ${reportMeta.company} — ${reportMeta.role} (${MODEL})...\n`);

let llmText;
try {
  llmText = await callXaiChat(systemPrompt);
} catch (err) {
  fail(`xAI API error: ${redactSecrets(err.message)}`);
}

let parsed;
try {
  parsed = JSON.parse(stripJsonFence(llmText));
} catch {
  fail('xAI returned invalid JSON. Retry or check XAI_API_KEY quota.');
}

const placeholders = parsed.placeholders || parsed;
const rawFormat = String(parsed.pageFormat || '').toLowerCase();
if (rawFormat !== 'letter' && rawFormat !== 'a4') {
  fail(`Invalid pageFormat "${parsed.pageFormat}" — must be "letter" or "a4"`);
}
const pageFormat = rawFormat;

applyContactDefaults(placeholders, contact);
applyContentDefaults(placeholders);

try {
  validatePlaceholders(placeholders, cvContent);
} catch (err) {
  fail(err.message);
}

const reportSuffix = reportNumber
  ? String(reportNumber).padStart(3, '0')
  : basename(resolvedReport, '.md').split('-')[0] || '000';
const htmlFilename = `cv-${candidateSlug}-${companySlug}-${reportSuffix}-${today}.html`;
const pdfFilename = `cv-${candidateSlug}-${companySlug}-${reportSuffix}-${today}.pdf`;
mkdirSync(PATHS.output, { recursive: true });
const htmlPath = join(PATHS.output, htmlFilename);
const pdfPath = join(PATHS.output, pdfFilename);

const html = fillTemplate(template, placeholders);
writeFileSync(htmlPath, html, 'utf-8');
process.stderr.write(`HTML written: ${relative(ROOT, htmlPath)}\n`);

try {
  execFileSync(process.execPath, [
    join(ROOT, 'generate-pdf.mjs'),
    htmlPath,
    pdfPath,
    `--format=${pageFormat}`,
  ], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
} catch (err) {
  const detail = err.stderr?.toString?.() || err.message || 'PDF generation failed';
  fail(`generate-pdf.mjs failed: ${detail.trim()}`);
}

if (!existsSync(pdfPath)) {
  fail('PDF file was not created');
}

emit({
  ok: true,
  htmlPath: relative(ROOT, htmlPath),
  pdfPath: relative(ROOT, pdfPath),
  pdfFilename,
  company: reportMeta.company,
  role: reportMeta.role,
  pageFormat,
  jobURL: normalizeUrl(reportMeta.url),
});