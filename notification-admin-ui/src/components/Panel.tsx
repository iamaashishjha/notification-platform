import type { ReactNode } from 'react';

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
