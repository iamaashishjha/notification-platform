import { ReactNode, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal, ModalButton } from './Modal';

type ConfirmVariant = 'primary' | 'danger';

type ConfirmIntent = {
  title: string;
  description?: string;
  body?: ReactNode;
  confirmLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
};

export function useConfirmDialog() {
  const [intent, setIntent] = useState<ConfirmIntent | null>(null);
  const [running, setRunning] = useState(false);

  async function confirm() {
    if (!intent) return;
    setRunning(true);
    try {
      await intent.onConfirm();
      setIntent(null);
    } finally {
      setRunning(false);
    }
  }

  const confirmDialog = intent ? (
    <Modal
      title={intent.title}
      description={intent.description}
      onClose={() => !running && setIntent(null)}
      width="max-w-md"
      footer={(
        <>
          <ModalButton disabled={running} onClick={() => setIntent(null)}>Cancel</ModalButton>
          <ModalButton disabled={running} variant={intent.variant === 'danger' ? 'danger' : 'primary'} onClick={confirm}>
            {running ? 'Saving...' : intent.confirmLabel || 'Confirm'}
          </ModalButton>
        </>
      )}
    >
      <div className="flex gap-4 px-6 py-5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${intent.variant === 'danger' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
          <AlertTriangle size={20} />
        </span>
        <div className="text-sm leading-6 text-slate-600">{intent.body || 'This action will be applied immediately.'}</div>
      </div>
    </Modal>
  ) : null;

  return {
    confirmDialog,
    requestConfirm: setIntent,
  };
}
