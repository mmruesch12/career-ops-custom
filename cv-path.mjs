import { existsSync } from 'fs';
import { join } from 'path';

/** Canonical CV locations (same order as loadProfile / saveCv). */
export const CV_RELATIVE_PATHS = ['cv.md', join('data', 'cv.md')];

/**
 * Absolute path to existing cv.md or data/cv.md, else default write target (cv.md).
 * @param {string} careerOpsPath
 */
export function resolveCvAbsolutePath(careerOpsPath) {
  for (const rel of CV_RELATIVE_PATHS) {
    const p = join(careerOpsPath, rel);
    if (existsSync(p)) return p;
  }
  return join(careerOpsPath, 'cv.md');
}

/**
 * Relative path to existing CV file, else default `cv.md`.
 * @param {string} careerOpsPath
 */
export function resolveCvRelativePath(careerOpsPath) {
  for (const rel of CV_RELATIVE_PATHS) {
    if (existsSync(join(careerOpsPath, rel))) return rel;
  }
  return 'cv.md';
}

/**
 * @param {string} careerOpsPath
 * @returns {boolean}
 */
export function cvFileExists(careerOpsPath) {
  return CV_RELATIVE_PATHS.some((rel) => existsSync(join(careerOpsPath, rel)));
}