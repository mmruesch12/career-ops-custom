/**
 * scan-title-filter.mjs — Side-effect-free title filter + tier classification.
 * Shared by scan.mjs (CLI scanner) and web/server/data-service.mjs (Matches API).
 *
 * Short tokens (AI, ML, Agent, …) use word boundaries to avoid substring
 * false-positives (failure, email, waitlist). Generic narrow positives
 * (Staff/Principal/Platform Engineer) require an AI-domain signal.
 */

const BROAD_POSITIVE_TERMS = new Set([
  'ai', 'ml', 'llm', 'agent', 'nlp', 'ki', 'speech', 'automation',
  'hyperautomation', 'low-code', 'no-code', 'revops', 'business systems',
  'internal tools', 'transformation', 'integration engineer', 'customer engineer',
  'gtm engineer', 'genai', 'generative ai', 'voice ai', 'conversational ai',
  'künstliche intelligenz', 'ki engineer', 'ki trainer', 'dozent', 'weiterbildung',
]);

// Qualifiers required when a broad token (AI, ML, Agent, …) matched.
// Includes leadership titles (manager/director/head) — those route to Tier B.
const BROAD_TERM_QUALIFIERS = [
  'engineer', 'engineering', 'researcher', 'research', 'architect', 'platform',
  'developer', 'scientist', 'engineering manager', 'design engineer',
  'machine learning', 'applied ai', 'swe', 'deployed', 'llmops', 'mlops',
  'mts', 'member of technical staff', 'manager', 'director', 'head',
];

const SINGLE_TOKEN_BROAD = new Set([
  'ai', 'ml', 'llm', 'agent', 'nlp', 'ki', 'speech',
]);

const AI_INTRINSIC_SINGLES = new Set([
  'agentic', 'llmops', 'mlops', 'genai',
]);

const AI_COMPOUND_POSITIVE_RE = /\b(principal ai|staff ai|head of ai|director of ai|applied ai|ai platform|ai engineering|voice ai|conversational ai|generative ai|forward deployed|deployed engineer|ki engineer|machine learning)\b/i;

const AI_DOMAIN_SIGNALS = [
  'ai', 'ml', 'llm', 'agent', 'agentic', 'genai', 'generative ai', 'nlp',
  'machine learning', 'applied ai', 'ai platform', 'llmops', 'mlops',
  'voice ai', 'conversational ai', 'agent engineer', 'agent design',
  'forward deployed', 'forward-deployed', 'multimodal', 'speech',
  'ki engineer', 'künstliche intelligenz',
];

const IMPLICIT_NEGATIVE_PHRASES = [
  'account executive', 'strategic account', 'account manager', 'sales',
  'business development', 'gtm', 'evangelist', 'fellows program', 'fellow,',
  'fellow ', 'strategist', 'partner solutions', 'solutions engineer',
  'customer engineer', 'solutions architect', 'growth marketing',
  'marketing manager', 'product manager', 'technical pm', 'recruiter',
  'talent acquisition', 'campus', 'university relations', 'latam',
  'portuguese', 'spanish speaking', 'german speaking', 'french speaking',
  'mandarin', 'japanese speaking', 'korean speaking',
];

const STRONG_TIER_A_PATTERNS = [
  'principal ai', 'staff ai', 'applied ai engineer', 'applied ai architect',
  'agent engineer', 'agent design engineer', 'forward deployed ai',
  'forward deployed engineer', 'forward-deployed', 'ai platform',
  'llmops', 'mlops', 'ai research engineer', 'staff ai research',
  'senior agent design',
];

const TIER_A_ARCHETYPE_SIGNALS = [
  'applied ai', 'agentic', 'ai platform', 'llmops', 'mlops',
  'agent engineer', 'forward deployed', 'genai', 'generative ai',
  'machine learning', 'ai research', 'agent design', 'voice ai',
];

function normalizeTitleKeywords(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr
    .filter((k) => typeof k === 'string')
    .map((k) => k.toLowerCase().trim())
    .filter(Boolean);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary phrase match — prevents 'ai' matching failure/email/waitlist. */
export function titleContainsPhrase(title, phrase) {
  if (typeof title !== 'string' || typeof phrase !== 'string') return false;
  const lower = title.toLowerCase();
  const p = phrase.toLowerCase().trim();
  if (!p) return false;
  const pattern = p.split(/\s+/).map(escapeRegex).join('\\s+');
  const re = new RegExp(`(?:^|[^a-z0-9])${pattern}(?:[^a-z0-9]|$)`, 'i');
  return re.test(lower);
}

function titleHasImplicitNegative(lower) {
  return IMPLICIT_NEGATIVE_PHRASES.some((phrase) => titleContainsPhrase(lower, phrase));
}

function titleHasBroadTermQualifier(lower) {
  return BROAD_TERM_QUALIFIERS.some((q) => titleContainsPhrase(lower, q));
}

function titleHasAiDomainSignal(lower) {
  return AI_DOMAIN_SIGNALS.some((s) => titleContainsPhrase(lower, s));
}

function isBroadPositive(keyword) {
  return BROAD_POSITIVE_TERMS.has(keyword);
}

function isAiSpecificPositive(keyword) {
  // Bare single-token broad keywords (AI, ML, Agent, …) always need a qualifier.
  if (SINGLE_TOKEN_BROAD.has(keyword)) return false;
  if (AI_INTRINSIC_SINGLES.has(keyword)) return true;
  if (!keyword.includes(' ')) return false;
  return AI_COMPOUND_POSITIVE_RE.test(keyword);
}

function extractTierASignals(profile) {
  const signals = new Set(TIER_A_ARCHETYPE_SIGNALS);
  const archetypes = profile?.target_roles?.archetypes || [];
  for (const arch of archetypes) {
    if (arch?.fit !== 'primary' || !arch?.name) continue;
    const name = String(arch.name).toLowerCase();
    if (titleContainsPhrase(name, 'agentic')) signals.add('agentic');
    if (titleContainsPhrase(name, 'llmops') || titleContainsPhrase(name, 'llm ops')) signals.add('llmops');
    if (titleContainsPhrase(name, 'mlops') || titleContainsPhrase(name, 'ml ops')) signals.add('mlops');
    if (titleContainsPhrase(name, 'agent')) signals.add('agent engineer');
    if (titleContainsPhrase(name, 'applied')) signals.add('applied ai');
    if (titleContainsPhrase(name, 'ai platform')) signals.add('ai platform');
  }
  return [...signals];
}

function titleHasSeniority(lower, titleFilterConfig) {
  const boost = normalizeTitleKeywords(titleFilterConfig?.seniority_boost);
  if (boost.some((s) => titleContainsPhrase(lower, s))) return true;
  return /\b(senior|staff|principal|lead|head|director)\b/.test(lower);
}

function titleHasTierASignal(lower, profile) {
  return extractTierASignals(profile).some((s) => titleContainsPhrase(lower, s));
}

function isLeadershipTitle(lower) {
  if (titleContainsPhrase(lower, 'engineering manager')) return true;
  if (titleContainsPhrase(lower, 'senior manager')) return true;
  if (titleContainsPhrase(lower, 'vice president')) return true;
  if (/\bvp\b/.test(lower)) return true;
  return /\b(manager|director|head)\b/.test(lower);
}

/**
 * Classify a job title into a deterministic tier for matches curation.
 * Returns 'A' for IC/primary engineer matches, 'B' for manager/director/head
 * roles with AI relevance, or null when unclassified.
 */
export function classifyTitleTier(title, titleFilterConfig, profile) {
  if (typeof title !== 'string' || title.trim() === '') return null;
  const lower = title.toLowerCase();

  const primary = profile?.target_roles?.primary || [];
  for (const phrase of primary) {
    if (typeof phrase === 'string' && phrase.trim() && titleContainsPhrase(lower, phrase)) {
      return isLeadershipTitle(lower) ? 'B' : 'A';
    }
  }

  if (isLeadershipTitle(lower) && titleHasAiDomainSignal(lower)) return 'B';

  if (STRONG_TIER_A_PATTERNS.some((p) => titleContainsPhrase(lower, p))) return 'A';

  if (titleHasSeniority(lower, titleFilterConfig) && titleHasTierASignal(lower, profile)) {
    return 'A';
  }

  return null;
}

export function buildTitleFilter(titleFilter) {
  const positive = normalizeTitleKeywords(titleFilter?.positive);
  const negative = normalizeTitleKeywords(titleFilter?.negative);

  return (title) => {
    if (typeof title !== 'string' || title.trim() === '') return false;
    const lower = title.toLowerCase();

    if (titleHasImplicitNegative(lower)) return false;
    if (negative.some((k) => titleContainsPhrase(lower, k))) return false;
    if (positive.length === 0) return true;

    const matched = positive.filter((k) => titleContainsPhrase(lower, k));
    if (matched.length === 0) return false;

    if (matched.some((k) => isAiSpecificPositive(k))) return true;

    if (matched.some((k) => isBroadPositive(k)) && titleHasBroadTermQualifier(lower)) return true;

    const genericMatched = matched.filter((k) => !isBroadPositive(k) && !isAiSpecificPositive(k));
    if (genericMatched.length > 0 && titleHasAiDomainSignal(lower)) return true;

    return false;
  };
}