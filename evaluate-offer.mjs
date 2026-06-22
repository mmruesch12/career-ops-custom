#!/usr/bin/env node
/**
 * evaluate-offer.mjs — xAI Grok-powered job offer evaluator for career-ops
 *
 * Usage:
 *   node evaluate-offer.mjs --url <job-url>
 *   node evaluate-offer.mjs --file ./jds/my-job.txt
 *
 * Requires: XAI_API_KEY in .env, cv.md (or data/cv.md)
 * Model: XAI_MODEL (default grok-4-1-fast-reasoning)
 */

import {
  readFileSync, existsSync, writeFileSync, mkdirSync, realpathSync,
} from 'fs';
import { join, dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { chromium } from 'playwright';
import { resolveCvAbsolutePath, cvFileExists } from './cv-path.mjs';
import {
  checkUrlLivenessWithFallback,
  createHeadedPageProvider,
  newLivenessPage,
  rejectPrivateOrInvalid,
} from './liveness-browser.mjs';

try {
  const { config } = await import('dotenv');
  config({ quiet: true });
} catch {
  // dotenv optional
}

const ROOT = dirname(fileURLToPath(import.meta.url));
const XAI_BASE_URL = (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/$/, '');
const MODEL = process.env.XAI_MODEL || 'grok-4-1-fast-reasoning';
const MAX_JD_CHARS = 80_000;

const PATHS = {
  shared: join(ROOT, 'modes', '_shared.md'),
  oferta: join(ROOT, 'modes', 'oferta.md'),
  profile: join(ROOT, 'modes', '_profile.md'),
  profileYml: join(ROOT, 'config', 'profile.yml'),
  reports: join(ROOT, 'reports'),
  pipeline: join(ROOT, 'data', 'pipeline.md'),
  trackerAdditions: join(ROOT, 'batch', 'tracker-additions'),
};

function emit(result, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(exitCode);
}

function fail(error, hint) {
  const payload = { ok: false, error: String(error) };
  if (hint) payload.hint = hint;
  emit(payload, 1);
}

function redactSecrets(message) {
  let out = String(message || '');
  if (process.env.XAI_API_KEY) {
    out = out.replaceAll(process.env.XAI_API_KEY, '[REDACTED]');
  }
  return out;
}

function assertInsideRepo(absolutePath) {
  const root = realpathSync(ROOT);
  const resolved = existsSync(absolutePath) ? realpathSync(absolutePath) : resolve(absolutePath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    fail('path must stay inside repo root');
  }
  return resolved;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

function tsvSafe(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

function normalizedTrackerScore(value) {
  const clean = tsvSafe(value);
  if (!clean || clean === '?') return 'N/A';
  return /\/5$/i.test(clean) ? clean : `${clean}/5`;
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    return `${u.origin}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return String(url).trim().replace(/\/$/, '').toLowerCase();
  }
}

function readOptional(path, label) {
  if (!existsSync(path)) {
    process.stderr.write(`⚠️  ${label} not found at: ${path}\n`);
    return `[${label} not found — skipping]`;
  }
  return readFileSync(path, 'utf-8').trim();
}

function reserveReportNumber() {
  try {
    const num = execFileSync(process.execPath, [join(ROOT, 'reserve-report-num.mjs')], {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
    if (!/^\d{3}$/.test(num)) {
      fail('reserve-report-num.mjs returned an invalid report number');
    }
    return num;
  } catch (err) {
    fail(`Could not reserve report number: ${redactSecrets(err.message)}`);
  }
}

// Idempotent: reserve-report-num --release no-ops when sentinel is already gone.
function releaseReportNumber(num) {
  try {
    execFileSync(process.execPath, [join(ROOT, 'reserve-report-num.mjs'), '--release', num], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
  } catch {
    // non-fatal — verify-pipeline GC handles stale sentinels
  }
}

function parseArgs(argv) {
  let url = '';
  let filePath = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url' && argv[i + 1]) {
      url = String(argv[++i]).trim();
    } else if (argv[i] === '--file' && argv[i + 1]) {
      filePath = String(argv[++i]).trim();
    } else if (argv[i] === '--help' || argv[i] === '-h') {
      process.stderr.write('Usage: node evaluate-offer.mjs --url <url>\n');
      process.stderr.write('       node evaluate-offer.mjs --file <path>\n');
      process.exit(0);
    }
  }
  return { url, filePath };
}

function resolveJdFilePath(filePath) {
  const resolved = resolve(ROOT, filePath);
  assertInsideRepo(resolved);
  if (!existsSync(resolved)) fail(`File not found: ${filePath}`);
  return resolved;
}

function validateEvaluationShape(text) {
  const issues = [];
  const requiredBlocks = [
    ['A', /(?:^|\n)#{1,3}\s*(?:A[).:-]?|Block A\b)/im],
    ['B', /(?:^|\n)#{1,3}\s*(?:B[).:-]?|Block B\b)/im],
    ['C', /(?:^|\n)#{1,3}\s*(?:C[).:-]?|Block C\b)/im],
    ['D', /(?:^|\n)#{1,3}\s*(?:D[).:-]?|Block D\b)/im],
    ['E', /(?:^|\n)#{1,3}\s*(?:E[).:-]?|Block E\b)/im],
    ['F', /(?:^|\n)#{1,3}\s*(?:F[).:-]?|Block F\b)/im],
    ['G', /(?:^|\n)#{1,3}\s*(?:G[).:-]?|Block G\b)/im],
  ];

  for (const [label, pattern] of requiredBlocks) {
    if (!pattern.test(text)) issues.push(`missing Block ${label}`);
  }

  const summary = text.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
  if (!summary) {
    issues.push('missing SCORE_SUMMARY block');
  } else {
    const summaryBlock = summary[1];
    for (const key of ['COMPANY', 'ROLE', 'ARCHETYPE', 'LEGITIMACY']) {
      const field = summaryBlock.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'mi'));
      const value = field?.[1]?.trim() ?? '';
      if (!value || (key !== 'COMPANY' && value.toLowerCase() === 'unknown')) {
        issues.push(`SCORE_SUMMARY ${key} is required`);
      }
    }

    const score = summaryBlock.match(/^\s*SCORE:\s*([0-9]+(?:\.[0-9]+)?)/mi);
    const scoreValue = score ? Number(score[1]) : NaN;
    if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 5) {
      issues.push('SCORE_SUMMARY score must be a number between 0 and 5');
    }
  }

  if (!/##\s*Machine Summary/i.test(text)) {
    issues.push('missing Machine Summary section');
  }

  if (issues.length > 0) {
    throw new Error(`Invalid career-ops report: ${issues.join('; ')}`);
  }
}

function extractScoreSummary(text) {
  const summaryMatch = text.match(/---SCORE_SUMMARY---\s*([\s\S]*?)---END_SUMMARY---/);
  const defaults = {
    company: 'unknown',
    role: 'unknown',
    score: '?',
    archetype: 'unknown',
    legitimacy: 'unknown',
  };
  if (!summaryMatch) return defaults;

  const block = summaryMatch[1];
  const extract = (key) => {
    const prefix = `${key}:`;
    for (const line of block.split('\n')) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith(prefix)) {
        return trimmed.slice(prefix.length).trim();
      }
    }
    return 'unknown';
  };

  return {
    company: extract('COMPANY'),
    role: extract('ROLE'),
    score: extract('SCORE'),
    archetype: extract('ARCHETYPE'),
    legitimacy: extract('LEGITIMACY'),
  };
}

async function callXaiCompletion(prompt) {
  const apiKey = process.env.XAI_API_KEY;
  const res = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.4,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(180_000),
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

function abortFetch(message, hint) {
  const err = new Error(message);
  if (hint) err.hint = hint;
  throw err;
}

async function fetchJdFromUrl(url) {
  const guardError = rejectPrivateOrInvalid(url);
  if (guardError) {
    abortFetch(guardError.reason, 'Provide a public http(s) job posting URL');
  }

  let browser = null;
  let headed = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await newLivenessPage(browser);
    headed = createHeadedPageProvider(chromium);
    const getHeadedPage = () => headed.get();

    const livenessCheck = await checkUrlLivenessWithFallback(page, url, { getHeadedPage });
    const { activePage, httpStatus, result, reason } = livenessCheck;

    if (result === 'expired') {
      abortFetch(`Posting appears closed: ${reason}`, 'Try a different URL or paste JD with --file');
    }

    // activePage already navigated during liveness — reuse its DOM, not a stale headless challenge page
    const bodyText = await activePage.evaluate(() => document.body?.innerText ?? '');
    const finalUrl = activePage.url();

    const finalGuard = rejectPrivateOrInvalid(finalUrl);
    if (finalGuard) {
      abortFetch(`Redirected to blocked URL: ${finalGuard.reason}`, 'Try a different job posting URL');
    }

    if (!bodyText.trim() || bodyText.trim().length < 200) {
      abortFetch('Could not extract enough job description text from the page', 'Paste the JD to a file and use --file');
    }

    return {
      jdText: bodyText.trim().slice(0, MAX_JD_CHARS),
      finalUrl,
      liveness: result,
      livenessReason: reason || '',
      httpStatus: httpStatus ?? 0,
    };
  } catch (err) {
    if (err.name === 'TimeoutError' || /timeout/i.test(err.message)) {
      abortFetch('Timed out fetching job page', 'Retry or use --file with pasted JD text');
    }
    throw err;
  } finally {
    if (headed) {
      try {
        await headed.close();
      } catch {
        // best-effort
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch {
        // best-effort
      }
    }
  }
}

export function consumePipelineUrl(url, careerOpsPath = ROOT) {
  const pipelinePath = join(careerOpsPath, 'data', 'pipeline.md');
  if (!existsSync(pipelinePath)) return false;
  const content = readFileSync(pipelinePath, 'utf-8');
  const target = normalizeUrl(url);
  let found = false;
  const updated = content.split('\n').filter((line) => {
    const lineUrl = line.match(/https?:\/\/[^\s)]+/)?.[0];
    if (!lineUrl) return true;
    if (lineUrl === url || normalizeUrl(lineUrl) === target) {
      found = true;
      return false;
    }
    return true;
  });
  if (!found) return false;
  writeFileSync(pipelinePath, updated.join('\n'));
  return true;
}

function buildSystemPrompt({
  sharedContext,
  ofertaLogic,
  cvContent,
  profileContent,
  profileYml,
  sourceUrl,
  livenessNote,
}) {
  return `You are career-ops, an AI-powered job search assistant.
You evaluate job offers against the user's CV using a structured A-G scoring system.

Your evaluation methodology is defined below. Follow it exactly.

═══════════════════════════════════════════════════════
SYSTEM CONTEXT (_shared.md)
═══════════════════════════════════════════════════════
${sharedContext}

═══════════════════════════════════════════════════════
EVALUATION MODE (oferta.md)
═══════════════════════════════════════════════════════
${ofertaLogic}

═══════════════════════════════════════════════════════
CANDIDATE RESUME (cv.md)
═══════════════════════════════════════════════════════
${cvContent}

═══════════════════════════════════════════════════════
CANDIDATE PROFILE & TARGETS (config/profile.yml)
═══════════════════════════════════════════════════════
${profileYml}

═══════════════════════════════════════════════════════
USER ARCHETYPES & NARRATIVE (_profile.md)
═══════════════════════════════════════════════════════
${profileContent}

═══════════════════════════════════════════════════════
OPERATING RULES FOR THIS SESSION
═══════════════════════════════════════════════════════
1. You do NOT have WebSearch. For Block D use training-data estimates, clearly labeled.
2. For Block G (Legitimacy): analyze the JD text and any URL/liveness context below.
3. Generate Blocks A through G in full, in English unless the JD is in another language.
4. Include a \`## Machine Summary\` section with a YAML fence (field names from oferta/batch spec).
5. At the very end (after all human-readable content), output:

---SCORE_SUMMARY---
COMPANY: <company name>
ROLE: <role title>
SCORE: <global score as decimal, e.g. 3.8>
ARCHETYPE: <detected archetype>
LEGITIMACY: <High Confidence | Proceed with Caution | Suspicious>
---END_SUMMARY---

${sourceUrl ? `JOB POSTING URL: ${sourceUrl}` : 'JOB POSTING URL: (not provided — file input)'}
${livenessNote ? `LIVENESS CHECK: ${livenessNote}` : ''}`;
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {

const { url, filePath } = parseArgs(process.argv.slice(2));

if (!url && !filePath) {
  fail('Provide --url <url> or --file <path>');
}
if (url && filePath) {
  fail('Use only one of --url or --file');
}

if (!process.env.XAI_API_KEY?.trim()) {
  fail('XAI_API_KEY not found. Add it to .env (get a key at https://console.x.ai/)');
}

if (!cvFileExists(ROOT)) {
  fail('cv.md not found (checked cv.md and data/cv.md). Create your default resume first.');
}

const cvPath = resolveCvAbsolutePath(ROOT);
const cvContent = readFileSync(cvPath, 'utf-8').trim();
if (!cvContent) {
  fail('CV file is empty. Add content to cv.md before evaluating offers.');
}

let jdText = '';
let sourceUrl = '';
let livenessNote = '';

if (url) {
  if (!/^https?:\/\//i.test(url)) {
    fail('Invalid URL — only http and https are supported');
  }
  process.stderr.write(`Fetching JD from ${url}...\n`);
  try {
    const fetched = await fetchJdFromUrl(url);
    jdText = fetched.jdText;
    sourceUrl = fetched.finalUrl || url;
    livenessNote = `${fetched.liveness} (HTTP ${fetched.httpStatus})${fetched.livenessReason ? ` — ${fetched.livenessReason}` : ''}`;
  } catch (err) {
    fail(redactSecrets(err.message), err.hint);
  }
} else {
  const resolvedFile = resolveJdFilePath(filePath);
  jdText = readFileSync(resolvedFile, 'utf-8').trim();
  if (!jdText) fail('JD file is empty');
}

const sharedContext = readOptional(PATHS.shared, 'modes/_shared.md');
const ofertaLogic = readOptional(PATHS.oferta, 'modes/oferta.md');
const profileContent = readOptional(PATHS.profile, 'modes/_profile.md');
const profileYml = readOptional(PATHS.profileYml, 'config/profile.yml');

const systemPrompt = buildSystemPrompt({
  sharedContext,
  ofertaLogic,
  cvContent,
  profileContent,
  profileYml,
  sourceUrl,
  livenessNote,
});

process.stderr.write(`Evaluating with xAI (${MODEL})... this may take 60-120 seconds.\n`);

let evaluationText;
try {
  evaluationText = await callXaiCompletion(
    `${systemPrompt}\n\nJOB DESCRIPTION TO EVALUATE:\n\n${jdText}`,
  );
} catch (err) {
  const msg = redactSecrets(err.message);
  if (/quota|rate|limit/i.test(msg)) {
    fail(`xAI API error: ${msg}`, 'Wait and retry, or check XAI_API_KEY quota');
  }
  fail(`xAI API error: ${msg}`);
}

try {
  validateEvaluationShape(evaluationText);
} catch (err) {
  fail(err.message, 'Retry the evaluation or use the Claude pipeline for this JD');
}

const { company, role, score, archetype, legitimacy } = extractScoreSummary(evaluationText);
const num = reserveReportNumber();
const today = new Date().toISOString().split('T')[0];
const companySlug = slugify(company);
const filename = `${num}-${companySlug}-${today}.md`;
const reportPath = join(PATHS.reports, filename);
const trackerPath = join(PATHS.trackerAdditions, `${num}-${companySlug}.tsv`);
const reportRelative = `reports/${filename}`;

const bodyWithoutSummary = evaluationText
  .replace(/---SCORE_SUMMARY---[\s\S]*?---END_SUMMARY---/, '')
  .trim();

const reportContent = `# Evaluation: ${company} — ${role}

**Date:** ${today}
**Archetype:** ${archetype}
**Score:** ${score}/5
**URL:** ${sourceUrl || ''}
**Legitimacy:** ${legitimacy}
**PDF:** pending

---

${bodyWithoutSummary}
`;

try {
  mkdirSync(PATHS.reports, { recursive: true });
  writeFileSync(reportPath, reportContent, 'utf-8');
  mkdirSync(PATHS.trackerAdditions, { recursive: true });
  const trackerFields = [
    String(parseInt(num, 10)),
    today,
    tsvSafe(company),
    tsvSafe(role),
    'Evaluated',
    normalizedTrackerScore(score),
    '❌',
    `[${num}](${reportRelative})`,
    'xAI evaluation',
  ];
  writeFileSync(trackerPath, `${trackerFields.join('\t')}\n`, 'utf-8');
  process.stderr.write(`Report saved: ${reportRelative}\n`);
} catch (err) {
  // fail() calls process.exit — finally does not run on this path
  releaseReportNumber(num);
  fail(`Failed to save report: ${err.message}`);
} finally {
  releaseReportNumber(num);
}

try {
  execFileSync(process.execPath, [join(ROOT, 'merge-tracker.mjs')], {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
  });
  process.stderr.write('Tracker merged into data/applications.md.\n');
} catch (err) {
  fail(
    `Report saved but merge-tracker failed: ${redactSecrets(err.message)}`,
    `Run: node merge-tracker.mjs`,
  );
}

let removedFromPipeline = false;
if (sourceUrl) {
  try {
    removedFromPipeline = consumePipelineUrl(sourceUrl) || consumePipelineUrl(url);
  } catch {
    // non-fatal
  }
}

const numericScore = Number(score);
emit({
  ok: true,
  reportNumber: num,
  reportPath: reportRelative,
  score: Number.isFinite(numericScore) ? numericScore : score,
  company,
  role,
  removedFromPipeline,
});
}