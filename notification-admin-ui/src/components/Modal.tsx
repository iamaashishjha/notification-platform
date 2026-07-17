import { ReactNode, useEffect } from 'react';
import { Check, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from './Button';

export function Modal({ title, description, children, footer, onClose, width = 'max-w-3xl' }: { title: string; description?: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: 'max-w-md' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl' }) {
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

function modalIcon(children: ReactNode) {
  const label = typeof children === 'string' ? children.toLowerCase() : '';
  if (label.includes('creating') || label.includes('saving') || label.includes('deleting')) return LoaderCircle;
  if (label.includes('cancel') || label.includes('close')) return X;
  if (label.includes('delete') || label.includes('revoke')) return Trash2;
  if (label.includes('edit')) return Pencil;
  if (label.includes('create') || label.includes('add')) return Plus;
  if (label.includes('save') || label.includes('saved')) return label.includes('saved') ? Check : Save;
  return undefined;
}

export function ModalButton({ children, onClick, variant = 'secondary', disabled = false, type = 'button' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <Button type={type} onClick={onClick} disabled={disabled} variant={variant} icon={modalIcon(children)} className={typeof children === 'string' && /creating|saving|deleting/i.test(children) ? '[&_svg]:animate-spin' : ''}>{children}</Button>;
}
