import type { StatusFilter } from '../lib/types';

const TABS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'evaluated', label: 'Evaluated' },
  { id: 'applied', label: 'Applied' },
  { id: 'interview', label: 'Interview' },
  { id: 'top', label: 'Top ≥4' },
  { id: 'skip', label: 'Skip' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'discarded', label: 'Discarded' },
];

interface Props {
  active: StatusFilter;
  onChange: (filter: StatusFilter) => void;
  counts?: Record<string, number>;
}

export function FilterTabs({ active, onChange, counts }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const count =
          tab.id === 'all' ? counts?.total : counts?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`tab-pill ${active === tab.id ? 'tab-pill-active' : 'tab-pill-inactive'}`}
          >
            {tab.label}
            {count !== undefined && count > 0 && (
              <span className="ml-1.5 text-xs opacity-60">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}