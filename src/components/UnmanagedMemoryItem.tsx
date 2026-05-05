import { memo } from "react";
import { useI18n } from "../i18n";
import type { UnmanagedMemory } from "../types";
import ProfileNameBadge from "./ProfileNameBadge";
import "./MemoryItem.css";

interface UnmanagedMemoryItemProps {
  memory: UnmanagedMemory;
  onImport: () => void;
}

function UnmanagedMemoryItem({ memory, onImport }: UnmanagedMemoryItemProps) {
  const { t } = useI18n();
  const preview = memory.content.split("\n")[0] || "";
  const targetLabel =
    memory.targetType === "rule" ? t("memory.targetType.rule") : t("memory.targetType.claude");
  const canImport = memory.importStatus === "ready";

  return (
    <div className="memory-item memory-item-unmanaged">
      <div className="memory-header">
        <ProfileNameBadge
          name={memory.name}
          colorSeedScope={`unmanaged:${memory.sourcePath}`}
          size="sm"
          fallbackChar="U"
        />

        <div className="memory-info">
          <h3 className="memory-name">{memory.name}</h3>
          <div className="memory-target-row">
            <span className={`memory-target-badge memory-target-badge--${memory.targetType}`}>
              {targetLabel}
            </span>
            <span className="memory-target-path">{memory.sourcePath}</span>
          </div>
          {memory.pathPatterns.length > 0 ? (
            <p className="memory-path-patterns">
              {t("memory.pathPatternsShort")}: {memory.pathPatterns.join(", ")}
            </p>
          ) : null}
          <p className="memory-preview">{preview}</p>
        </div>

        <div className="memory-header-actions">
          <span className="memory-status unmanaged">{t("memory.unmanaged")}</span>
          <button
            type="button"
            className="memory-import-btn"
            disabled={!canImport}
            title={canImport ? t("memory.import") : t("memory.unmanagedPathConflict")}
            onClick={onImport}
          >
            {t("memory.import")}
          </button>
        </div>
      </div>

      {!canImport ? (
        <p className="memory-unmanaged-hint">{t("memory.unmanagedPathConflict")}</p>
      ) : (
        <p className="memory-unmanaged-hint">{t("memory.unmanagedImportHint")}</p>
      )}
    </div>
  );
}

export default memo(UnmanagedMemoryItem);
