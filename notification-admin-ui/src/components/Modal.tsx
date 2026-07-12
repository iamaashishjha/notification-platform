import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, description, children, footer, onClose, width = 'max-w-3xl' }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: 'max-w-md' | 'max-w-2xl' | 'max-w-3xl' }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', closeOnEscape);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', closeOnEscape); document.body.style.overflow = previous; };
  }, [onClose]);

  return <div className="template-modal-root" role="dialog" aria-modal="true" aria-label={title}>
    <button className="template-modal-backdrop" onClick={onClose} aria-label="Close modal" />
    <section className={`template-modal-panel ${width}`}>
      <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5"><div><h2 className="text-lg font-semibold text-slate-900">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div><button onClick={onClose} className="focus-ring rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={19} /></button></header>
      <div className="max-h-[calc(92vh-160px)] overflow-y-auto">{children}</div>
      {footer && <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">{footer}</footer>}
    </section>
  </div>;
}

export function ModalButton({ children, onClick, variant = 'secondary', disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; type?: 'button' | 'submit' }) {
  const colors = variant === 'primary' ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : variant === 'danger' ? 'border-red-600 bg-red-600 text-white hover:bg-red-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
  return <button type={type} onClick={onClick} disabled={disabled} className={`focus-ring rounded-md border px-4 py-2 text-sm font-medium shadow-sm disabled:opacity-60 ${colors}`}>{children}</button>;
}
