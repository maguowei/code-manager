import type { ReactNode } from "react";
import useEscapeKey from "../hooks/useEscapeKey";
import "./ConfirmDialog.css";

interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

function ConfirmDialog({
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  // ESC 键关闭确认对话框，并阻止事件冒泡到外层（如抽屉）
  useEscapeKey((e) => {
    e?.stopImmediatePropagation();
    onCancel();
  });

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog__title">{title}</div>
        <div className="confirm-dialog__message">{message}</div>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-dialog__btn ${
              danger ? "confirm-dialog__btn--danger" : "confirm-dialog__btn--confirm"
            }`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
