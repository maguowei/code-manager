import { useState, useRef, useCallback, DragEvent } from "react";
import { ClaudeConfig } from "../types";
import { useI18n } from "../i18n";
import ConfigItem from "./ConfigItem";
import "./ConfigList.css";

interface ConfigListProps {
  configs: ClaudeConfig[];
  activeConfigId: string | null;
  editingConfigId: string | null;
  onActivate: (id: string) => void;
  onEdit: (config: ClaudeConfig) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

function ConfigList({ configs, activeConfigId, editingConfigId, onActivate, onEdit, onDelete, onDuplicate, onReorder }: ConfigListProps) {
  const { t } = useI18n();
  // 使用 ref 存储拖拽源索引，避免闭包陈旧问题
  const dragIndexRef = useRef<number | null>(null);
  // 使用 state 控制视觉反馈
  const [dragState, setDragState] = useState<{
    draggingIndex: number | null;
    overIndex: number | null;
    overPosition: "above" | "below" | null;
  }>({ draggingIndex: null, overIndex: null, overPosition: null });

  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    dragIndexRef.current = index;
    setDragState({ draggingIndex: index, overIndex: null, overPosition: null });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragState({ draggingIndex: null, overIndex: null, overPosition: null });
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === index) return;

    // 根据鼠标在元素中的位置判断插入方向
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "above" : "below";

    setDragState((prev) => {
      if (prev.overIndex === index && prev.overPosition === position) return prev;
      return { ...prev, overIndex: index, overPosition: position };
    });
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
    // 检查是否真的离开了当前元素（而非进入子元素）
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;

    setDragState((prev) => {
      if (prev.overIndex !== index) return prev;
      return { ...prev, overIndex: null, overPosition: null };
    });
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>, dropIndex: number) => {
    e.preventDefault();

    const fromIndex = dragIndexRef.current;
    if (fromIndex === null || fromIndex === dropIndex) {
      handleDragEnd();
      return;
    }

    // 根据鼠标位置计算插入点
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const insertAfter = e.clientY >= midY;

    const newConfigs = [...configs];
    const [dragged] = newConfigs.splice(fromIndex, 1);

    // 计算移除源项后的目标位置
    let targetIndex = dropIndex;
    if (fromIndex < dropIndex) {
      targetIndex -= 1;
    }
    if (insertAfter) {
      targetIndex += 1;
    }

    newConfigs.splice(targetIndex, 0, dragged);
    onReorder(newConfigs.map((c) => c.id));
    handleDragEnd();
  }, [configs, onReorder, handleDragEnd]);

  if (configs.length === 0) {
    return (
      <div className="config-list-empty">
        <div className="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="18" x2="12" y2="12"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <p className="empty-text">{t("configList.empty")}</p>
        <p className="empty-hint">{t("configList.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className={`config-list${dragState.draggingIndex !== null ? " is-dragging" : ""}`} onDragOver={(e) => e.preventDefault()}>
      {configs.map((config, index) => (
        <ConfigItem
          key={config.id}
          config={config}
          index={index}
          isActive={config.id === activeConfigId}
          isEditing={config.id === editingConfigId}
          isDragging={dragState.draggingIndex === index}
          dragOverPosition={dragState.overIndex === index ? dragState.overPosition : null}
          onActivate={onActivate}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}

export default ConfigList;
