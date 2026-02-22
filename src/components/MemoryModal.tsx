import { useState } from "react";
import { Memory } from "../types";
import { useI18n } from "../i18n";
import "./MemoryModal.css";

interface MemoryModalProps {
  memory: Memory | null;
  onSave: (data: { name: string; content: string }) => void;
  onClose: () => void;
}

function MemoryModal({ memory, onSave, onClose }: MemoryModalProps) {
  const { t } = useI18n();
  const [name, setName] = useState(memory?.name || "");
  const [content, setContent] = useState(memory?.content || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      content,
    });
  }

  return (
    <div className="memory-drawer-container">
      <div
        className="memory-modal"
        role="dialog"
        aria-labelledby="memory-modal-title"
        aria-modal="true"
      >
        <form id="memory-form" onSubmit={handleSubmit}>
          <div className="memory-modal-header">
            <button
              type="button"
              className="memory-back-btn"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h2 id="memory-modal-title">{memory ? t("memory.editTitle") : t("memory.addTitle")}</h2>
            <button type="submit" className="memory-save-btn" disabled={!name.trim()}>
              {t("memory.save")}
            </button>
          </div>

          <div className="memory-modal-body">
            <div className="memory-badge-large">
              <span>{name ? name.charAt(0).toUpperCase() : "M"}</span>
            </div>

            <div className="form-group">
              <label htmlFor="memory-name" className="label-required">
                <span>{t("memory.name")}</span>
                <span className="required-badge">{t("form.required")}</span>
              </label>
              <input
                id="memory-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("memory.namePlaceholder")}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="memory-content">{t("memory.content")}</label>
              <textarea
                id="memory-content"
                className="memory-content-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("memory.contentPlaceholder")}
                rows={16}
              />
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MemoryModal;
