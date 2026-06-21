const reMoneySpan = /~?\$\d[\d,]*(?:\.\d+)?[KkMm]?(?:\s*[-–]\s*\$?\d[\d,]*(?:\.\d+)?[KkMm]?)?/g;
const reISODate = /\b20\d{2}-\d{2}-\d{2}\b/g;
const reCityState = /\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,2}),? (A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/;
const reMoneyPart = /(\d[\d,]*(?:\.\d+)?)\s*([KkMm]?)/g;
const reEstHint = /\(est[),;. ]|\best\)|\bmarket\b/;

function payCeiling(span) {
  let top = 0;
  for (const match of span.matchAll(reMoneyPart)) {
    let v = parseFloat(match[1].replace(/,/g, ''));
    const suffix = match[2].toLowerCase();
    if (suffix === 'k') v *= 1000;
    if (suffix === 'm') v *= 1_000_000;
    if (v > top) top = v;
  }
  return top;
}

export function deriveNoteFields(app) {
  const lower = `${app.role} ${app.notes}`.toLowerCase();

  const notesMatch = app.notes.match(reCityState);
  const roleMatch = app.role.match(reCityState);
  if (notesMatch) {
    app.location = `${notesMatch[1]}, ${notesMatch[2]}`;
  } else if (roleMatch) {
    app.location = `${roleMatch[1]}, ${roleMatch[2]}`;
  }

  if (lower.includes('hybrid')) {
    app.workMode = 'Hybrid';
  } else if (
    lower.includes('remote') &&
    (lower.includes('flex') || lower.includes('remote-first') || lower.includes('remote first'))
  ) {
    app.workMode = 'RemoteFlex';
  } else if (lower.includes('remote')) {
    app.workMode = 'Remote';
  } else if (lower.includes('onsite') || lower.includes('on-site') || lower.includes('in-office')) {
    app.workMode = 'Full';
  } else if (app.location) {
    app.workMode = 'Full';
  }

  const matches = [...app.notes.matchAll(reMoneySpan)].map((m) => m[0]);
  for (const mm of matches) {
    if (/[-–]/.test(mm)) {
      app.payRange = mm;
      break;
    }
  }
  if (!app.payRange && matches.length > 0) {
    app.payRange = matches[0];
  }
  app.payMax = payCeiling(app.payRange || '');
  if (app.payRange) {
    if (lower.includes('(posted')) {
      app.paySource = 'POSTED';
    } else if (reEstHint.test(lower)) {
      app.paySource = 'est';
    }
  }

  let last = app.date;
  for (const d of app.notes.matchAll(reISODate)) {
    if (d[0] > last) last = d[0];
  }
  app.lastContact = last;
}