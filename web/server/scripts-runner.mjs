import { spawn } from 'child_process';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CAREER_OPS_ROOT = resolve(__dirname, '../..');

const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB
const SIGKILL_GRACE_MS = 3000;

const ALLOWED_SCRIPTS = new Set([
  'scan.mjs',
  'followup-cadence.mjs',
  'analyze-patterns.mjs',
  'doctor.mjs',
  'verify-pipeline.mjs',
  'generate-pdf.mjs',
  'normalize-statuses.mjs',
  'dedup-tracker.mjs',
  'merge-tracker.mjs',
  'reconcile-pipeline.mjs',
]);

function appendBounded(current, chunk, label, script) {
  const next = current + chunk.toString();
  if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) {
    throw new Error(`Script ${script} exceeded max ${label} buffer (${MAX_OUTPUT_BYTES} bytes)`);
  }
  return next;
}

/**
 * Spawn a career-ops root script safely (cwd = repo root).
 * @param {string} script - Script filename relative to career-ops root (e.g. 'scan.mjs')
 * @param {string[]} args - CLI arguments
 * @param {{ timeout?: number }} options
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
export function runScript(script, args = [], { timeout = 120_000 } = {}) {
  const scriptBase = script.split('/').pop();
  if (!ALLOWED_SCRIPTS.has(scriptBase)) {
    return Promise.reject(new Error(`Script not allowed: ${script}`));
  }

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: CAREER_OPS_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;
    let killTimer = null;

    const clearTimers = () => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
    };

    const timer = timeout > 0
      ? setTimeout(() => {
          killed = true;
          child.kill('SIGTERM');
          killTimer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // process may already be gone
            }
          }, SIGKILL_GRACE_MS);
        }, timeout)
      : null;

    child.stdout.on('data', (chunk) => {
      try {
        stdout = appendBounded(stdout, chunk, 'stdout', script);
      } catch (err) {
        clearTimers();
        child.kill('SIGKILL');
        rejectPromise(err);
      }
    });

    child.stderr.on('data', (chunk) => {
      try {
        stderr = appendBounded(stderr, chunk, 'stderr', script);
      } catch (err) {
        clearTimers();
        child.kill('SIGKILL');
        rejectPromise(err);
      }
    });

    child.on('error', (err) => {
      clearTimers();
      rejectPromise(err);
    });

    child.on('close', (code) => {
      clearTimers();
      if (killed) {
        rejectPromise(new Error(`Script ${script} timed out after ${timeout}ms`));
        return;
      }
      resolvePromise({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });
  });
}

/**
 * Run a script and parse JSON from stdout.
 * @param {string} script
 * @param {string[]} args
 * @param {{ timeout?: number }} options
 */
export async function runScriptJSON(script, args = [], options = {}) {
  const result = await runScript(script, args, options);
  if (result.exitCode !== 0 && !result.stdout) {
    throw new Error(result.stderr || `Script ${script} failed with exit code ${result.exitCode}`);
  }
  try {
    return { data: JSON.parse(result.stdout), ...result };
  } catch {
    const stderrSnippet = result.stderr ? result.stderr.slice(0, 200) : '(empty)';
    throw new Error(
      `Failed to parse JSON from ${script} (exit ${result.exitCode}): ${result.stdout.slice(0, 200)} | stderr: ${stderrSnippet}`,
    );
  }
}