import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import {
  parseApplications,
  enrichApplications,
  computeMetrics,
  computeProgressMetrics,
  sortApplications,
  filterApplications,
  loadReport,
  loadPipeline,
  loadStates,
  updateApplicationStatus,
  updateApplicationNotes,
  addPipelineUrl,
  removePipelineUrl,
  loadScanHistory,
  loadProfile,
  loadPortals,
  listInterviewPrep,
  loadInterviewPrep,
  safeOutputFile,
  extractPdfPath,
  findHtmlForPdf,
  validateStatusValue,
  getCareerOpsRoot,
  computeMatches,
  saveCv,
  updateApplicationPdf,
  updateReportPdfPath,
  getResumePrerequisites,
  getEvaluatePrerequisites,
} from './data-service.mjs';
import { runScript, runScriptJSON, runScriptJSONOk } from './scripts-runner.mjs';
import {
  assertNoScriptRunning,
  withFileMutationLock,
  withScriptLock,
  withTrackerScriptLock,
} from './mutex.mjs';
import { rejectPrivateOrInvalid } from '../../liveness-browser.mjs';

const app = express();
const PORT = process.env.PORT || 3847;
const HOST = process.env.HOST || '127.0.0.1';
const API_TOKEN = process.env.API_TOKEN || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const ROOT = getCareerOpsRoot();

try {
  const { config } = await import('dotenv');
  config({ path: join(ROOT, '.env'), quiet: true });
} catch {
  // dotenv optional
}

const actionRateLimits = new Map();
const ACTION_RATE_WINDOW_MS = 60_000;
const ACTION_RATE_MAX = 10;

app.use(cors({
  origin(origin, callback) {
    if (!origin || CORS_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },
}));
app.use((req, res, next) => {
  const limit = req.method === 'PUT' && req.path === '/api/cv' ? '300kb' : '64kb';
  return express.json({ limit })(req, res, next);
});

function validateReportNumber(reportNumber) {
  if (!/^\d+$/.test(String(reportNumber))) {
    const err = new Error('reportNumber must be numeric');
    err.statusCode = 400;
    throw err;
  }
}

function getApps() {
  return enrichApplications(parseApplications(ROOT), ROOT);
}

function scriptError(res, err, status = 500) {
  const code = err.statusCode || status;
  res.status(code).json({ error: err.message || 'Script execution failed' });
}

function requireActionAuth(req, res, next) {
  if (!API_TOKEN) return next();
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${API_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized — set Authorization: Bearer <API_TOKEN>' });
}

function rateLimitActions(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'local';
  const now = Date.now();

  for (const [k, entry] of actionRateLimits) {
    if (now > entry.resetAt) actionRateLimits.delete(k);
  }

  const entry = actionRateLimits.get(key) || { count: 0, resetAt: now + ACTION_RATE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + ACTION_RATE_WINDOW_MS;
  }
  entry.count += 1;
  actionRateLimits.set(key, entry);
  if (entry.count > ACTION_RATE_MAX) {
    return res.status(429).json({ error: 'Too many action requests. Try again later.' });
  }
  return next();
}

const mutationMiddleware = [requireActionAuth, rateLimitActions];

app.get('/api/health', (_req, res) => {
  const payload = { ok: true, host: HOST };
  if (process.env.NODE_ENV === 'development') payload.root = ROOT;
  res.json(payload);
});

app.get('/api/applications', (req, res) => {
  const { filter = 'all', sort = 'score' } = req.query;
  const allApps = getApps();
  let apps = allApps;
  if (filter !== 'all') apps = filterApplications(apps, String(filter));
  apps = sortApplications(apps, String(sort));
  res.json({ applications: apps, metrics: computeMetrics(allApps) });
});

app.get('/api/metrics', (_req, res) => {
  const apps = getApps();
  res.json({
    pipeline: computeMetrics(apps),
    progress: computeProgressMetrics(apps),
  });
});

app.get('/api/progress', (_req, res) => {
  res.json(computeProgressMetrics(getApps()));
});

app.get('/api/pipeline-inbox', (_req, res) => {
  res.json({
    ...loadPipeline(ROOT),
    prerequisites: getEvaluatePrerequisites(ROOT),
  });
});

app.post('/api/pipeline-inbox', mutationMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    assertNoScriptRunning('A scan is in progress. Inbox edits are disabled until it finishes.');
    const result = await withFileMutationLock(() => Promise.resolve(addPipelineUrl(ROOT, url)));
    res.json(result);
  } catch (err) {
    scriptError(res, err, err.statusCode || 400);
  }
});

app.delete('/api/pipeline-inbox', mutationMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    assertNoScriptRunning('A scan is in progress. Inbox edits are disabled until it finishes.');
    const result = await withFileMutationLock(() => Promise.resolve(removePipelineUrl(ROOT, url)));
    res.json(result);
  } catch (err) {
    scriptError(res, err, err.statusCode || 400);
  }
});

app.get('/api/states', (_req, res) => {
  res.json(loadStates());
});

app.get('/api/reports/:reportNumber', (req, res) => {
  const apps = getApps();
  const app = apps.find((a) => a.reportNumber === req.params.reportNumber);
  if (!app?.reportPath) {
    return res.status(404).json({ error: 'Report not found' });
  }
  const content = loadReport(ROOT, app.reportPath);
  if (!content) return res.status(404).json({ error: 'Report file missing' });
  res.json({ application: app, content });
});

app.patch('/api/applications/:reportNumber/status', mutationMiddleware, async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  try {
    validateReportNumber(req.params.reportNumber);
    assertNoScriptRunning('A script is running. Status updates are disabled until it finishes.');
    const validated = validateStatusValue(status);
    await withFileMutationLock(() =>
      updateApplicationStatus(ROOT, req.params.reportNumber, validated),
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.patch('/api/applications/:reportNumber/notes', mutationMiddleware, async (req, res) => {
  const { notes } = req.body;
  if (notes === undefined || notes === null) {
    return res.status(400).json({ error: 'notes required (string)' });
  }
  if (typeof notes !== 'string') {
    return res.status(400).json({ error: 'notes must be a string' });
  }
  try {
    validateReportNumber(req.params.reportNumber);
    assertNoScriptRunning('A script is running. Notes updates are disabled until it finishes.');
    await withFileMutationLock(() =>
      updateApplicationNotes(ROOT, req.params.reportNumber, notes),
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// --- Data reads ---

app.get('/api/profile', (_req, res) => {
  res.json(loadProfile(ROOT));
});

app.get('/api/matches', (_req, res) => {
  res.json(computeMatches(ROOT));
});

app.put('/api/cv', mutationMiddleware, async (req, res) => {
  const { content } = req.body;
  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'content required (string)' });
  }
  try {
    assertNoScriptRunning('A script is running. CV save is disabled until it finishes.');
    const result = await withFileMutationLock(() => Promise.resolve(saveCv(ROOT, content)));
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.get('/api/followups', async (_req, res) => {
  try {
    const { data, exitCode, stderr } = await runScriptJSON('followup-cadence.mjs');
    if (data.error) {
      return res.status(200).json(data);
    }
    res.json({ ...data, exitCode, stderr });
  } catch (err) {
    scriptError(res, err);
  }
});

app.get('/api/patterns', async (_req, res) => {
  try {
    const { data, exitCode, stderr } = await runScriptJSON('analyze-patterns.mjs');
    if (data.error) {
      return res.status(200).json(data);
    }
    res.json({ ...data, exitCode, stderr });
  } catch (err) {
    scriptError(res, err);
  }
});

app.get('/api/doctor', async (_req, res) => {
  try {
    const { data, exitCode, stderr } = await runScriptJSON('doctor.mjs', ['--json']);
    res.json({ ...data, exitCode, stderr });
  } catch (err) {
    scriptError(res, err);
  }
});

app.get('/api/verify', async (_req, res) => {
  try {
    const result = await runScript('verify-pipeline.mjs');
    res.json(result);
  } catch (err) {
    scriptError(res, err);
  }
});

app.get('/api/scan-history', (_req, res) => {
  res.json(loadScanHistory(ROOT));
});

app.get('/api/interview-prep', (_req, res) => {
  res.json({ files: listInterviewPrep(ROOT) });
});

app.get('/api/interview-prep/:slug', (req, res) => {
  const doc = loadInterviewPrep(ROOT, req.params.slug);
  if (!doc) return res.status(404).json({ error: 'Interview prep file not found' });
  res.json(doc);
});

app.get('/api/output/:filename', (req, res) => {
  try {
    const filePath = safeOutputFile(ROOT, req.params.filename);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.sendFile(filePath);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/portals', (_req, res) => {
  res.json(loadPortals(ROOT));
});

// --- Actions ---

app.post('/api/actions/scan', mutationMiddleware, async (_req, res) => {
  try {
    const result = await withTrackerScriptLock(() => runScript('scan.mjs', [], { timeout: 300_000 }));
    res.json(result);
  } catch (err) {
    scriptError(res, err, err.statusCode || 500);
  }
});

app.post('/api/actions/evaluate', mutationMiddleware, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, error: 'url required' });
    }
    const trimmedUrl = url.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      return res.status(400).json({ ok: false, error: 'Invalid URL — only http and https are supported' });
    }
    const urlGuard = rejectPrivateOrInvalid(trimmedUrl);
    if (urlGuard) {
      return res.status(400).json({
        ok: false,
        error: urlGuard.reason,
        hint: 'Provide a public http(s) job posting URL',
      });
    }

    const prereqs = getEvaluatePrerequisites(ROOT);
    if (!prereqs.hasCv) {
      return res.status(400).json({
        ok: false,
        error: 'cv.md not found. Create your default resume in Profile first.',
      });
    }
    if (!prereqs.hasXaiKey) {
      return res.status(400).json({
        ok: false,
        error: 'XAI_API_KEY not found. Add it to .env at the repo root.',
      });
    }

    const result = await withTrackerScriptLock(async () => {
      const scriptResult = await runScriptJSONOk(
        'evaluate-offer.mjs',
        ['--url', trimmedUrl],
        { timeout: 300_000 },
      );
      return scriptResult.data;
    });
    res.json(result);
  } catch (err) {
    const payload = { ok: false, error: err.message };
    if (err.hint) payload.hint = err.hint;
    res.status(err.statusCode || 500).json(payload);
  }
});

app.post('/api/actions/resume/:reportNumber', mutationMiddleware, async (req, res) => {
  try {
    validateReportNumber(req.params.reportNumber);

    const prereqs = getResumePrerequisites(ROOT);
    if (!prereqs.hasCv) {
      return res.status(400).json({
        ok: false,
        error: 'cv.md not found. Create your default resume in Profile first.',
      });
    }
    if (!prereqs.hasXaiKey) {
      return res.status(400).json({
        ok: false,
        error: 'XAI_API_KEY not found. Add it to .env at the repo root.',
      });
    }

    const result = await withTrackerScriptLock(async () => {
      const apps = getApps();
      const application = apps.find((a) => a.reportNumber === req.params.reportNumber);
      if (!application?.reportPath) {
        const err = new Error('Application not found');
        err.statusCode = 404;
        throw err;
      }

      const scriptResult = await runScriptJSONOk(
        'generate-tailored-resume.mjs',
        ['--report', req.params.reportNumber],
        { timeout: 180_000 },
      );

      const { pdfFilename, company, role } = scriptResult.data;
      let trackerUpdated = false;
      let reportUpdated = false;
      try {
        await updateApplicationPdf(ROOT, req.params.reportNumber, '✅');
        trackerUpdated = true;
      } catch (err) {
        console.warn(
          `Tracker PDF update failed for report ${req.params.reportNumber}:`,
          err.message,
        );
      }
      try {
        reportUpdated = updateReportPdfPath(ROOT, application.reportPath, pdfFilename);
      } catch (err) {
        console.warn(
          `Report PDF header update failed for report ${req.params.reportNumber}:`,
          err.message,
        );
      }

      return {
        ok: true,
        pdfFilename,
        downloadUrl: `/api/output/${encodeURIComponent(pdfFilename)}`,
        company,
        role,
        trackerUpdated,
        reportUpdated,
      };
    });
    res.json(result);
  } catch (err) {
    const payload = { ok: false, error: err.message };
    if (err.hint) payload.hint = err.hint;
    res.status(err.statusCode || 500).json(payload);
  }
});

app.post('/api/actions/pdf/:reportNumber', mutationMiddleware, async (req, res) => {
  try {
    validateReportNumber(req.params.reportNumber);
    const result = await withScriptLock(async () => {
      const apps = getApps();
      const application = apps.find((a) => a.reportNumber === req.params.reportNumber);
      if (!application?.reportPath) {
        const err = new Error('Application not found');
        err.statusCode = 404;
        throw err;
      }

      const pdfPath = application.pdfPath || extractPdfPath(ROOT, application.reportPath);
      const htmlPath = findHtmlForPdf(ROOT, pdfPath, application.reportPath);

      if (!htmlPath) {
        const err = new Error('No HTML source found for PDF generation. Run /career-ops pdf in your AI CLI first.');
        err.statusCode = 400;
        err.hint = `/career-ops pdf ${application.company.toLowerCase().replace(/\s+/g, '-')}`;
        throw err;
      }

      const outputPdf = pdfPath
        ? safeOutputFile(ROOT, pdfPath)
        : safeOutputFile(ROOT, `cv-${basename(application.reportPath, '.md')}.pdf`);

      const scriptResult = await runScript('generate-pdf.mjs', [htmlPath, outputPdf], { timeout: 120_000 });
      return { ...scriptResult, outputPath: `output/${basename(outputPdf)}` };
    });
    res.json(result);
  } catch (err) {
    const payload = { error: err.message };
    if (err.hint) payload.hint = err.hint;
    res.status(err.statusCode || 500).json(payload);
  }
});

app.post('/api/actions/verify', mutationMiddleware, async (_req, res) => {
  try {
    const result = await withScriptLock(() => runScript('verify-pipeline.mjs'));
    res.json(result);
  } catch (err) {
    scriptError(res, err, err.statusCode || 500);
  }
});

app.post('/api/actions/normalize', mutationMiddleware, async (_req, res) => {
  try {
    const result = await withTrackerScriptLock(() => runScript('normalize-statuses.mjs'));
    res.json(result);
  } catch (err) {
    scriptError(res, err, err.statusCode || 500);
  }
});

app.post('/api/actions/dedup', mutationMiddleware, async (_req, res) => {
  try {
    const result = await withTrackerScriptLock(() => runScript('dedup-tracker.mjs'));
    res.json(result);
  } catch (err) {
    scriptError(res, err, err.statusCode || 500);
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Career-Ops API running at http://${HOST}:${PORT}`);
  console.log(`Reading data from ${ROOT}`);
  if (API_TOKEN) {
    console.log('Mutation endpoints require API_TOKEN authorization');
  } else if (HOST !== '127.0.0.1' && HOST !== 'localhost') {
    console.warn('WARNING: API_TOKEN is unset and server is not bound to localhost. Set API_TOKEN for remote access.');
  }
});