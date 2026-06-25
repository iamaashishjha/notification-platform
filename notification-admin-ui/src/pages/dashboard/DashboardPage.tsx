import { Panel } from '../../components/Panel';

const cards = [
  ['Queued', '0'],
  ['Sent today', '0'],
  ['Failed', '0'],
  ['Active campaigns', '0']
];

export function DashboardPage() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-white p-4">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <Panel title="Operations">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="rounded-md border border-slate-200 p-4">Feature flags and channel checks run at send time.</div>
          <div className="rounded-md border border-slate-200 p-4">Mock providers keep local delivery testable without credentials.</div>
          <div className="rounded-md border border-slate-200 p-4">Workers can scale independently through Docker Compose.</div>
        </div>
      </Panel>
    </div>
  );
}
