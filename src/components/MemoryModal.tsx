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
      content: content,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="back-btn" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2>{memory ? t("memory.editTitle") : t("memory.addTitle")}</h2>
          <div className="header-spacer"></div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {/* 徽章 */}
            <div className="config-badge-large">
              <span>{name ? name.charAt(0).toUpperCase() : "M"}</span>
            </div>

            {/* 记忆名称 */}
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

            {/* 记忆内容 */}
            <div className="form-group">
              <label htmlFor="memory-content">{t("memory.content")}</label>
              <textarea
                id="memory-content"
                className="memory-content-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("memory.contentPlaceholder")}
                rows={12}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>
              {t("memory.cancel")}
            </button>
            <button type="submit" className="btn-save">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {t("memory.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MemoryModal;
