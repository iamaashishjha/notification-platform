import { CheckCircle2, XCircle } from 'lucide-react';

export function StatusToggle({
  value,
  label,
  disabled,
  onToggle,
}: {
  value: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const status = value ? 'Enabled' : 'Disabled';
  const Icon = value ? CheckCircle2 : XCircle;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={`${label}: ${status}`}
      title={status}
      disabled={disabled}
      onClick={onToggle}
      className={`focus-ring inline-flex h-6 w-11 items-center rounded-full px-1 transition disabled:cursor-not-allowed disabled:opacity-60 ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`flex h-4 w-4 items-center justify-center rounded-full bg-white transition ${value ? 'translate-x-5 text-emerald-600' : 'translate-x-0 text-slate-500'}`}>
        <Icon size={10} />
      </span>
    </button>
  );
}
