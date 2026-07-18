import { ReactNode } from 'react';
import { Search } from 'lucide-react';

export function FilterToolbar({ children }: { children: ReactNode }) {
  return <div className="template-toolbar">{children}</div>;
}

export function SearchControl({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="template-search-control">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</label>
      <div className="template-control-input">
        <Search aria-hidden="true" size={16} />
        <input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      </div>
    </div>
  );
}

export function SelectFilter({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="template-filter-control">
      <label htmlFor={id}>{label}</label>
      <div className="template-control-select">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
      </div>
    </div>
  );
}
