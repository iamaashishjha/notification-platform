import { CheckCircle2, Clock3, XCircle } from 'lucide-react';

const positive = new Set(['active', 'enabled', 'sent', 'approved', 'healthy', 'connected', 'sending']);
const negative = new Set(['inactive', 'disabled', 'failed', 'revoked', 'cancelled', 'dead', 'blocked']);

export function StatusBadge({ status }: { status: string | boolean | null | undefined }) {
  const value = typeof status === 'boolean' ? (status ? 'enabled' : 'disabled') : (status || 'unknown').toLowerCase();
  const good = positive.has(value);
  const bad = negative.has(value);
  const Icon = good ? CheckCircle2 : bad ? XCircle : Clock3;
  const colors = good ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : bad ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700';
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${colors}`}><Icon size={13} />{value.replace(/_/g, ' ')}</span>;
}
