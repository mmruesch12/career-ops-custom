import { statusConfig } from '../lib/utils';

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const { label, color } = statusConfig(status);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${color}`}>
      {label}
    </span>
  );
}