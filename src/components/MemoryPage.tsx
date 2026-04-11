import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import { useI18n } from "../i18n";
import type { Memory, MemoryState } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Drawer from "./Drawer";
import { PlusIcon } from "./Icons";
import MemoryEditor from "./MemoryEditor";
import MemoryItem from "./MemoryItem";
import "./MemoryPage.css";

function MemoryPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    try {
      const state = await invoke<MemoryState>("get_memories");
      setMemories(state.memories);
    } catch (_err) {
      showToast(t("toast.memoryLoadError"), "error");
    }
  }, [showToast, t]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // ESC 键关闭记忆编辑抽屉
  useEscapeKey(
    useCallback(() => {
      setEditingMemory(null);
      setIsModalOpen(false);
      onDrawerChange?.(false);
    }, [onDrawerChange]),
    isModalOpen,
  );

  async function handleAdd(data: { name: string; content: string }) {
    try {
      const newMemory = await invoke<Memory>("add_memory", {
        name: data.name,
        content: data.content,
      });
      setIsModalOpen(false);
      setMemories((prev) => [...prev, newMemory]);
      showToast(t("toast.memoryAdded"));
    } catch (_err) {
      showToast(t("toast.memoryAddError"), "error");
    }
  }

  async function handleUpdate(data: { name: string; content: string }) {
    if (!editingMemory) return;
    try {
      const updated = await invoke<Memory>("update_memory", {
        id: editingMemory.id,
        name: data.name,
        content: data.content,
      });
      setEditingMemory(null);
      setIsModalOpen(false);
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showToast(t("toast.memorySaved"));
    } catch (_err) {
      showToast(t("toast.memorySaveError"), "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_memory", { id });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      showToast(t("toast.memoryDeleted"));
    } catch (_err) {
      showToast(t("toast.memoryDeleteError"), "error");
    }
  }

  async function handleToggle(id: string) {
    try {
      const toggled = await invoke<Memory>("toggle_memory", { id });
      setMemories((prev) => prev.map((m) => (m.id === toggled.id ? toggled : m)));
    } catch (_err) {
      showToast(t("toast.memoryToggleError"), "error");
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
    <div className="list-page">
      {/* 页面标题栏 */}
      <div className="page-header">
        <h1 className="page-title">{t("nav.memory")}</h1>
      </div>

      {/* 添加按钮 */}
      <button type="button" className="add-config-btn" onClick={openAddModal}>
        <PlusIcon />
        <span>{t("memory.addMemory")}</span>
      </button>

      {/* 记忆列表 */}
      {memories.length === 0 ? (
        <div className="list-empty">
          <div className="empty-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
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
        <div className="list-container">
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
        <Drawer onClose={closeModal}>
          <MemoryEditor
            memory={editingMemory}
            onSave={editingMemory ? handleUpdate : handleAdd}
            onClose={closeModal}
          />
        </Drawer>
      )}
    </div>
  );
}

export default MemoryPage;
