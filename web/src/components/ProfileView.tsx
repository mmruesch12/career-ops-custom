import { useEffect, useState } from 'react';
import { AlertCircle, Check, FileText, Loader2, Save, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { saveCv } from '../lib/api';
import type { DoctorData, ProfileData } from '../lib/types';

interface Props {
  profile: ProfileData | null;
  doctor?: DoctorData | null;
  doctorError?: string | null;
  loading: boolean;
  error?: string | null;
}

type Tab = 'cv' | 'profile';

export function ProfileView({ profile, doctor, doctorError, loading, error }: Props) {
  const [tab, setTab] = useState<Tab>('cv');
  const [cvDraft, setCvDraft] = useState('');
  const [cvDirty, setCvDirty] = useState(false);
  const [cvSaving, setCvSaving] = useState(false);
  const [cvSaveError, setCvSaveError] = useState<string | null>(null);
  const [cvSaved, setCvSaved] = useState(false);

  useEffect(() => {
    if (profile?.cv?.content != null) {
      setCvDraft(profile.cv.content);
    } else if (profile) {
      setCvDraft('');
    }
    setCvDirty(false);
    setCvSaveError(null);
    setCvSaved(false);
  }, [profile?.cv?.content, profile]);

  const handleSaveCv = async () => {
    setCvSaving(true);
    setCvSaveError(null);
    setCvSaved(false);
    try {
      await saveCv(cvDraft);
      setCvDirty(false);
      setCvSaved(true);
    } catch (err) {
      setCvSaveError(err instanceof Error ? err.message : 'Failed to save CV');
    } finally {
      setCvSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-subtle">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading profile...
      </div>
    );
  }

  if (!profile && !loading) {
    return (
      <div className="glass-panel py-16 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-red" />
        <p className="mt-4 font-display text-lg text-subtle">Failed to load profile</p>
        <p className="mt-2 text-sm text-muted">
          {error || 'Profile data is unavailable. Try refreshing.'}
        </p>
      </div>
    );
  }

  if (profile?.onboardingNeeded) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow/15 ring-1 ring-yellow/30">
            <AlertCircle className="h-5 w-5 text-yellow" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Profile Setup Required</h2>
            <p className="text-sm text-subtle">Complete onboarding to unlock full career-ops features</p>
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-subtle">Missing files:</p>
          <ul className="mt-3 space-y-2">
            {profile.missing.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-muted">
                <FileText className="h-4 w-4 text-red" />
                <code className="text-blue">{f}</code>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border border-blue/30 bg-blue/10 p-4">
            <p className="text-sm text-text">
              Run <code className="text-blue">/career-ops interview</code> in your AI CLI to generate your profile and CV interactively.
            </p>
            <p className="mt-2 text-xs text-muted">
              Or copy <code>config/profile.example.yml</code> to <code>config/profile.yml</code> and create <code>cv.md</code> manually.
            </p>
          </div>
          {doctorError && (
            <div className="mt-4 rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
              Doctor check unavailable: {doctorError}
            </div>
          )}
          {doctor && (doctor.missing.length > 0 || doctor.warnings.length > 0) && (
            <div className="mt-4 rounded-xl border border-yellow/30 bg-yellow/10 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-yellow">Doctor check</p>
              {doctor.missing.length > 0 && (
                <p className="mt-2 text-sm text-subtle">
                  Missing: {doctor.missing.map((m) => (
                    <code key={m} className="mx-1 text-blue">{m}</code>
                  ))}
                </p>
              )}
              {doctor.warnings.map((w) => (
                <p key={w} className="mt-1 text-xs text-muted">⚠ {w}</p>
              ))}
            </div>
          )}
        </div>

        <CvEditorPanel
          cvPath={profile.cv?.path}
          cvDraft={cvDraft}
          cvDirty={cvDirty}
          cvSaving={cvSaving}
          cvSaved={cvSaved}
          cvSaveError={cvSaveError}
          onDraftChange={(value) => {
            setCvDraft(value);
            setCvDirty(true);
            setCvSaved(false);
          }}
          onSave={handleSaveCv}
          showOnboardingHint={!profile.cv}
        />
        {profile.profile && (
          <div className="glass-panel p-5">
            <h3 className="mb-4 font-display text-sm font-semibold text-subtle">Profile ({profile.profile.path})</h3>
            <ProfileFields parsed={profile.profile.parsed} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue/15 ring-1 ring-blue/30">
          <User className="h-5 w-5 text-blue" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">Profile</h2>
          <p className="text-sm text-subtle">Your CV and career-ops configuration</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab('cv')}
          className={`tab-pill ${tab === 'cv' ? 'tab-pill-active' : 'tab-pill-inactive'}`}
        >
          CV {profile?.cv?.path && <span className="ml-1 opacity-60">({profile.cv.path})</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('profile')}
          className={`tab-pill ${tab === 'profile' ? 'tab-pill-active' : 'tab-pill-inactive'}`}
        >
          Profile {profile?.profile?.path && <span className="ml-1 opacity-60">({profile.profile.path})</span>}
        </button>
      </div>

      {tab === 'cv' && (
        <CvEditorPanel
          cvPath={profile?.cv?.path}
          cvDraft={cvDraft}
          cvDirty={cvDirty}
          cvSaving={cvSaving}
          cvSaved={cvSaved}
          cvSaveError={cvSaveError}
          onDraftChange={(value) => {
            setCvDraft(value);
            setCvDirty(true);
            setCvSaved(false);
          }}
          onSave={handleSaveCv}
        />
      )}

      {tab === 'profile' && profile?.profile && (
        <div className="glass-panel p-5">
          <ProfileFields parsed={profile.profile.parsed} />
        </div>
      )}

      {doctorError && (
        <div className="rounded-xl border border-yellow/30 bg-yellow/10 px-4 py-3 text-sm text-yellow">
          Doctor check unavailable: {doctorError}
        </div>
      )}

      {doctor && doctor.warnings.length > 0 && (
        <div className="glass-panel p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-yellow">Setup warnings</p>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {doctor.warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CvEditorPanel({
  cvPath,
  cvDraft,
  cvDirty,
  cvSaving,
  cvSaved,
  cvSaveError,
  onDraftChange,
  onSave,
  showOnboardingHint = false,
}: {
  cvPath?: string;
  cvDraft: string;
  cvDirty: boolean;
  cvSaving: boolean;
  cvSaved: boolean;
  cvSaveError: string | null;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  showOnboardingHint?: boolean;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-semibold text-subtle">
            Default Resume {cvPath ? `(${cvPath})` : '(cv.md or data/cv.md)'}
          </h3>
          <p className="mt-1 text-sm text-subtle">
            {showOnboardingHint
              ? 'Create your CV here — required for Matches resume generation'
              : 'Edit your default resume — used by one-click resume generation on Matches'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cvSaved && (
            <span className="inline-flex items-center gap-1 text-xs text-green">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!cvDirty || cvSaving || !cvDraft.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue/15 px-3 py-2 text-sm font-medium text-blue transition-colors hover:bg-blue/25 disabled:opacity-50"
          >
            {cvSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </button>
        </div>
      </div>
      <textarea
        value={cvDraft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="# Your Name&#10;&#10;## Professional Summary&#10;..."
        className="min-h-[40vh] w-full rounded-xl border border-overlay/50 bg-mantle/50 p-4 font-mono text-sm leading-relaxed text-text focus:border-blue/50 focus:outline-none focus:ring-1 focus:ring-blue/30"
        spellCheck={false}
      />
      {cvSaveError && <p className="mt-3 text-sm text-red">{cvSaveError}</p>}
      {cvDraft.trim() && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">Preview rendered markdown</summary>
          <div className="prose-career mt-3 max-h-[40vh] overflow-y-auto rounded-lg bg-surface/30 p-4">
            <ReactMarkdown>{cvDraft}</ReactMarkdown>
          </div>
        </details>
      )}
    </div>
  );
}

function ProfileFields({ parsed }: { parsed: Record<string, unknown> }) {
  const candidate = (parsed.candidate || {}) as Record<string, string>;
  const narrative = (parsed.narrative || {}) as Record<string, unknown>;
  const compensation = (parsed.compensation || {}) as Record<string, string>;
  const location = (parsed.location || {}) as Record<string, string>;
  const targetRoles = (parsed.target_roles || {}) as Record<string, unknown>;

  const sections = [
    {
      title: 'Candidate',
      fields: [
        ['Name', candidate.full_name],
        ['Email', candidate.email],
        ['Location', candidate.location],
        ['LinkedIn', candidate.linkedin],
        ['GitHub', candidate.github],
        ['Portfolio', candidate.portfolio_url],
      ],
    },
    {
      title: 'Narrative',
      fields: [
        ['Headline', narrative.headline as string],
        ['Exit Story', narrative.exit_story as string],
      ],
    },
    {
      title: 'Compensation',
      fields: [
        ['Target', compensation.target_range],
        ['Minimum', compensation.minimum],
        ['Currency', compensation.currency],
      ],
    },
    {
      title: 'Location',
      fields: [
        ['Country', location.country],
        ['City', location.city],
        ['Timezone', location.timezone],
        ['Visa', location.visa_status],
      ],
    },
  ];

  const primaryRoles = (targetRoles.primary as string[]) || [];
  const archetypes = (targetRoles.archetypes as { name: string; level: string; fit: string }[]) || [];
  const superpowers = (narrative.superpowers as string[]) || [];

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            {section.title}
          </h4>
          <dl className="grid gap-2 sm:grid-cols-2">
            {section.fields.filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface/30 px-3 py-2">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="text-sm text-text">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}

      {primaryRoles.length > 0 && (
        <div>
          <h4 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Target Roles
          </h4>
          <div className="flex flex-wrap gap-2">
            {primaryRoles.map((r) => (
              <span key={r} className="rounded-full bg-blue/10 px-3 py-1 text-xs text-blue ring-1 ring-blue/20">
                {r}
              </span>
            ))}
          </div>
        </div>
      )}

      {archetypes.length > 0 && (
        <div>
          <h4 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Archetypes
          </h4>
          <div className="space-y-2">
            {archetypes.map((a) => (
              <div key={a.name} className="flex items-center justify-between rounded-lg bg-surface/30 px-3 py-2 text-sm">
                <span className="text-text">{a.name}</span>
                <span className="text-xs text-muted">{a.level} · {a.fit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {superpowers.length > 0 && (
        <div>
          <h4 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-subtle">
            Superpowers
          </h4>
          <ul className="space-y-1 text-sm text-subtle">
            {superpowers.map((s) => (
              <li key={s}>• {s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}