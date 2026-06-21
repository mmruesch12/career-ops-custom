import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from 'fs';
import { join, dirname, resolve, basename, relative, isAbsolute, sep } from 'path';
import { createHash, randomUUID } from 'crypto';
import { tmpdir } from 'os';

function pathIsInside(childPath, parentDir) {
  const rel = relative(parentDir, childPath);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function resolveTrackerLockDir(envValue, lockKey) {
  const tmpRoot = realpathSync(tmpdir());
  const fallback = join(tmpRoot, `career-ops-merge-tracker-${lockKey}.lock`);
  if (!envValue || !isAbsolute(envValue)) return fallback;

  const candidate = resolve(envValue);
  const parentDir = dirname(candidate);
  const canonicalParent = existsSync(parentDir) ? realpathSync(parentDir) : resolve(parentDir);
  if (!pathIsInside(canonicalParent, tmpRoot)) return fallback;
  if (!basename(candidate).startsWith('career-ops-merge-tracker-')) return fallback;
  return candidate;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Acquire the same filesystem lock merge-tracker.mjs uses for applications.md.
 * @param {string} trackerPath - Absolute path to applications.md
 * @param {{ timeoutMs?: number }} options
 */
export async function acquireTrackerLock(trackerPath, options = {}) {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retryMs = options.retryMs ?? 75;
  const staleMs = options.staleMs ?? 10 * 60_000;

  const canonical = existsSync(trackerPath) ? realpathSync(trackerPath) : resolve(trackerPath);
  const lockKey = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  const lockDir = resolveTrackerLockDir(process.env.CAREER_OPS_TRACKER_LOCK, lockKey);
  const token = randomUUID();
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      mkdirSync(lockDir);
      writeFileSync(
        join(lockDir, 'owner.json'),
        JSON.stringify({ pid: process.pid, token, started_at: new Date().toISOString(), tracker: canonical }, null, 2),
      );

      return {
        release() {
          try {
            const ownerPath = join(lockDir, 'owner.json');
            if (existsSync(ownerPath)) {
              const owner = JSON.parse(readFileSync(ownerPath, 'utf-8'));
              if (owner.token === token) {
                rmSync(lockDir, { recursive: true, force: true });
              }
            }
          } catch {
            // best effort
          }
        },
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;

      const ownerPath = join(lockDir, 'owner.json');
      if (existsSync(ownerPath)) {
        try {
          const owner = JSON.parse(readFileSync(ownerPath, 'utf-8'));
          const started = new Date(owner.started_at).getTime();
          if (Date.now() - started > staleMs && !isProcessAlive(owner.pid)) {
            rmSync(lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {
          // wait and retry
        }
      }
      await new Promise((r) => setTimeout(r, retryMs));
    }
  }

  const err = new Error('Tracker file is locked by another process. Try again shortly.');
  err.statusCode = 409;
  throw err;
}