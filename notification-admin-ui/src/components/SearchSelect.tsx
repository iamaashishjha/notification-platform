import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function SearchSelect({ value, options, onChange, placeholder = 'Select an option', className = '' }: { value: string; options: SelectOption[]; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return <div ref={root} className={`relative ${className}`}>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setQuery(''); }} className="focus-ring flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm">
      <span className={selected ? 'truncate text-slate-900' : 'truncate text-slate-400'}>{selected?.label || placeholder}</span><span className="ml-2 flex shrink-0 items-center gap-1.5 text-slate-400"><Search size={14}/><ChevronDown size={16} /></span>
    </button>
    {open && <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3"><Search size={15} className="text-slate-400" /><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search..." className="h-10 min-w-0 flex-1 border-0 text-sm outline-none" /></div>
      <div className="max-h-60 overflow-y-auto p-1" role="listbox">
        {filtered.map((option) => <button type="button" key={option.value} disabled={option.disabled} onClick={() => { onChange(option.value); setOpen(false); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-blue-50 disabled:opacity-40"><span>{option.label}</span>{value === option.value && <Check size={15} className="text-blue-600" />}</button>)}
        {!filtered.length && <div className="px-3 py-6 text-center text-sm text-slate-400">No results found</div>}
      </div>
    </div>}
  </div>;
}
