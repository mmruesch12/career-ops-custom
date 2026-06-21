/** Separate locks for quick file mutations vs long-running scripts. */
let fileMutationInProgress = false;
let scriptInProgress = false;

export function isScriptInProgress() {
  return scriptInProgress;
}

/**
 * Reject if a script is running (e.g. scan writing pipeline.md).
 * @throws {Error & { statusCode: number }}
 */
export function assertNoScriptRunning(message = 'A script is currently running. Try again when it finishes.') {
  if (scriptInProgress) {
    const err = new Error(message);
    err.statusCode = 409;
    throw err;
  }
}

/**
 * Run a quick file read-modify-write exclusively. Rejects with 409 if busy.
 * @param {() => Promise<unknown>} fn
 */
export async function withFileMutationLock(fn) {
  if (scriptInProgress) {
    const err = new Error('A script is currently running. Try again when it finishes.');
    err.statusCode = 409;
    throw err;
  }
  if (fileMutationInProgress) {
    const err = new Error('Another file operation is in progress. Try again shortly.');
    err.statusCode = 409;
    throw err;
  }
  fileMutationInProgress = true;
  try {
    return await fn();
  } finally {
    fileMutationInProgress = false;
  }
}

/**
 * Run a long-running script exclusively. Blocks file mutations while running.
 * Rejects with 409 if another script is already running.
 * @param {() => Promise<unknown>} fn
 */
export async function withScriptLock(fn) {
  if (scriptInProgress) {
    const err = new Error('Another script is already running. Try again shortly.');
    err.statusCode = 409;
    throw err;
  }
  scriptInProgress = true;
  try {
    return await fn();
  } finally {
    scriptInProgress = false;
  }
}

/**
 * Scripts that read-modify-write tracker files (applications.md) must hold
 * both locks to prevent racing with status/notes PATCH.
 * Acquires both locks in one step (no nested withScriptLock → withFileMutationLock).
 * @param {() => Promise<unknown>} fn
 */
export async function withTrackerScriptLock(fn) {
  if (scriptInProgress) {
    const err = new Error('Another script is already running. Try again shortly.');
    err.statusCode = 409;
    throw err;
  }
  if (fileMutationInProgress) {
    const err = new Error('Another file operation is in progress. Try again shortly.');
    err.statusCode = 409;
    throw err;
  }
  scriptInProgress = true;
  fileMutationInProgress = true;
  try {
    return await fn();
  } finally {
    fileMutationInProgress = false;
    scriptInProgress = false;
  }
}

/** @deprecated Use withFileMutationLock or withScriptLock */
export const withOperationLock = withFileMutationLock;