import { Button, ModalShell } from './ui';

type Props = {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmModal({ open, title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: Props) {
  return (
    <ModalShell
      open={open}
      title={title || '确认操作'}
      width={320}
      onClose={onCancel}
      footer={(
        <>
          <Button variant="secondary" size="md" onClick={onCancel}>
            {cancelLabel || '取消'}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} size="md" onClick={onConfirm}>
            {confirmLabel || '确认'}
          </Button>
        </>
      )}
    >
      {message}
    </ModalShell>
  );
}
