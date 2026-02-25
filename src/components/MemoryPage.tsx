import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Memory, MemoryState } from "../types";
import { useI18n } from "../i18n";
import MemoryItem from "./MemoryItem";
import MemoryModal from "./MemoryModal";
import ConfirmDialog from "./ConfirmDialog";
import "./MemoryPage.css";

function MemoryPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { t } = useI18n();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    try {
      const state = await invoke<MemoryState>("get_memories");
      setMemories(state.memories);
    } catch (err) {
      console.error("Failed to load memories:", err);
    }
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isModalOpen) {
        closeModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  async function handleAdd(data: { name: string; content: string }) {
    try {
      await invoke("add_memory", { name: data.name, content: data.content });
      setIsModalOpen(false);
      loadMemories();
    } catch (err) {
      console.error("Failed to add memory:", err);
    }
  }

  async function handleUpdate(data: { name: string; content: string }) {
    if (!editingMemory) return;
    try {
      await invoke("update_memory", {
        id: editingMemory.id,
        name: data.name,
        content: data.content,
      });
      setEditingMemory(null);
      setIsModalOpen(false);
      loadMemories();
    } catch (err) {
      console.error("Failed to update memory:", err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_memory", { id });
      loadMemories();
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  }

  async function handleToggle(id: string) {
    try {
      await invoke("toggle_memory", { id });
      loadMemories();
    } catch (err) {
      console.error("Failed to toggle memory:", err);
    }
  }

  function openAddModal() {
    setEditingMemory(null);
    setIsModalOpen(true);
    onDrawerChange?.(true);
  }

  function openEditModal(memory: Memory) {
    setEditingMemory(memory);
    setIsModalOpen(true);
    onDrawerChange?.(true);
  }

  function closeModal() {
    setEditingMemory(null);
    setIsModalOpen(false);
    onDrawerChange?.(false);
  }

  return (
    <div className="memory-page">
      {/* 页面标题栏 */}
      <div className="page-header">
        <h1 className="page-title">{t("nav.memory")}</h1>
      </div>

      {/* 添加按钮 */}
      <button className="add-config-btn" onClick={openAddModal}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>{t("memory.addMemory")}</span>
      </button>

      {/* 记忆列表 */}
      {memories.length === 0 ? (
        <div className="memory-empty">
          <div className="empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <p className="empty-text">{t("memory.empty")}</p>
          <p className="empty-hint">{t("memory.emptyHint")}</p>
        </div>
      ) : (
        <div className="memory-list">
          {memories.map((memory) => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              isEditing={isModalOpen && editingMemory?.id === memory.id}
              onToggle={() => handleToggle(memory.id)}
              onEdit={() => openEditModal(memory)}
              onDelete={() => setPendingDeleteId(memory.id)}
            />
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      {pendingDeleteId && (
        <ConfirmDialog
          title={t("confirm.deleteMemoryTitle")}
          message={t("confirm.deleteMemoryMessage")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            handleDelete(pendingDeleteId);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}

      {/* 弹窗 */}
      {isModalOpen && (
        <>
          <div className="drawer-overlay visible" onClick={closeModal} />
          <div className="drawer open">
            <MemoryModal
              memory={editingMemory}
              onSave={editingMemory ? handleUpdate : handleAdd}
              onClose={closeModal}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default MemoryPage;
