import { X } from 'lucide-react';

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

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.45)',
};

const boxStyle: React.CSSProperties = {
  background: 'var(--bg-1)', borderRadius: 12, padding: 20,
  width: 320, display: 'flex', flexDirection: 'column', gap: 14,
  border: '1px solid var(--glass-border)', boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
};

export default function ConfirmModal({ open, title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: Props) {
  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{title || '确认操作'}</span>
          <button type="button" onClick={onCancel}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', borderRadius: 4 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-0)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}
            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--line)', background: 'transparent', color: 'var(--text-0)', fontSize: 12, cursor: 'pointer' }}>
            {cancelLabel || '取消'}
          </button>
          <button type="button" onClick={onConfirm}
            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: danger ? '#e74c3c' : 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {confirmLabel || '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}
