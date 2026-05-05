import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import useEscapeKey from "../hooks/useEscapeKey";
import { useToast } from "../hooks/useToast";
import { type Language, useI18n } from "../i18n";
import type { Memory, MemoryState, UnmanagedMemory } from "../types";
import ConfirmDialog from "./ConfirmDialog";
import Drawer from "./Drawer";
import { ExternalLinkIcon, PlusIcon } from "./Icons";
import MemoryEditor from "./MemoryEditor";
import MemoryItem from "./MemoryItem";
import UnmanagedMemoryItem from "./UnmanagedMemoryItem";
import "./MemoryPage.css";

type MemoryPayload = {
  id?: string;
  name: string;
  content: string;
  targetType: Memory["targetType"];
  rulePath?: string;
  pathPatterns?: string[];
};

const CLAUDE_CODE_DOCS_BASE_URL = "https://code.claude.com/docs";
const CLAUDE_MEMORY_DOCS_PATH = "memory";

function getClaudeMemoryDocsUrl(language: Language) {
  const docsLocale = language === "zh" ? "zh-CN" : "en";
  return `${CLAUDE_CODE_DOCS_BASE_URL}/${docsLocale}/${CLAUDE_MEMORY_DOCS_PATH}`;
}

function MemoryPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [unmanagedMemories, setUnmanagedMemories] = useState<UnmanagedMemory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const applyMemoryState = useCallback((state: MemoryState) => {
    setMemories(state.memories);
    setUnmanagedMemories(state.unmanagedMemories ?? []);
  }, []);

  const loadMemories = useCallback(async () => {
    try {
      const state = await invoke<MemoryState>("get_memories");
      applyMemoryState(state);
    } catch (_err) {
      showToast(t("toast.memoryLoadError"), "error");
    }
  }, [applyMemoryState, showToast, t]);

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

  async function handleAdd(data: MemoryPayload) {
    try {
      const state = await invoke<MemoryState>("add_memory", { data });
      setIsModalOpen(false);
      applyMemoryState(state);
      showToast(t("toast.memoryAdded"));
    } catch (_err) {
      showToast(t("toast.memoryAddError"), "error");
    }
  }

  async function handleUpdate(data: MemoryPayload) {
    if (!editingMemory) return;
    try {
      const state = await invoke<MemoryState>("update_memory", { id: editingMemory.id, data });
      setEditingMemory(null);
      setIsModalOpen(false);
      applyMemoryState(state);
      showToast(t("toast.memorySaved"));
    } catch (_err) {
      showToast(t("toast.memorySaveError"), "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      const state = await invoke<MemoryState>("delete_memory", { id });
      applyMemoryState(state);
      showToast(t("toast.memoryDeleted"));
    } catch (_err) {
      showToast(t("toast.memoryDeleteError"), "error");
    }
  }

  async function handleToggle(id: string) {
    try {
      const state = await invoke<MemoryState>("toggle_memory", { id });
      applyMemoryState(state);
    } catch (_err) {
      showToast(t("toast.memoryToggleError"), "error");
    }
  }

  async function handleImport(memory: UnmanagedMemory) {
    try {
      const state = await invoke<MemoryState>("import_unmanaged_memory", {
        source: { targetType: memory.targetType, rulePath: memory.rulePath },
      });
      applyMemoryState(state);
      showToast(t("toast.memoryImported"));
    } catch (_err) {
      showToast(t("toast.memoryImportError"), "error");
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

  const claudeMemories = memories.filter((memory) => memory.targetType === "claude");
  const ruleMemories = memories.filter((memory) => memory.targetType === "rule");
  const hasAnyMemory = memories.length > 0 || unmanagedMemories.length > 0;
  const claudeMemoryDocsUrl = useMemo(() => getClaudeMemoryDocsUrl(language), [language]);

  const handleOpenDocs = useCallback(async () => {
    try {
      await openUrl(claudeMemoryDocsUrl);
    } catch {
      showToast(t("memory.openDocsError"), "error");
    }
  }, [claudeMemoryDocsUrl, showToast, t]);

  function renderMemoryGroup(title: string, description: string, items: Memory[]) {
    if (items.length === 0) return null;
    return (
      <section className="memory-group">
        <div className="memory-group-header">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="list-container">
          {items.map((memory) => (
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
      </section>
    );
  }

  function renderUnmanagedMemoryGroup(items: UnmanagedMemory[]) {
    if (items.length === 0) return null;
    return (
      <section className="memory-group memory-group-unmanaged">
        <div className="memory-group-header">
          <h2>{t("memory.group.unmanaged")}</h2>
          <p>{t("memory.group.unmanagedDescription")}</p>
        </div>
        <div className="list-container">
          {items.map((memory) => (
            <UnmanagedMemoryItem
              key={memory.id}
              memory={memory}
              onImport={() => handleImport(memory)}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="list-page">
      {/* 页面标题栏 */}
      <div className="page-header">
        <h1 className="page-title">{t("nav.memory")}</h1>
        <button
          type="button"
          className="memory-docs-link"
          aria-label={t("memory.openDocsAriaLabel")}
          title={t("memory.openDocsAriaLabel")}
          onClick={handleOpenDocs}
        >
          <span>{t("memory.openDocs")}</span>
          <ExternalLinkIcon size={14} />
        </button>
      </div>

      {/* 添加按钮 */}
      <button type="button" className="add-config-btn" onClick={openAddModal}>
        <PlusIcon />
        <span>{t("memory.addMemory")}</span>
      </button>

      {/* 记忆列表 */}
      {!hasAnyMemory ? (
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
        <>
          {renderMemoryGroup(
            t("memory.group.claude"),
            t("memory.group.claudeDescription"),
            claudeMemories,
          )}
          {renderMemoryGroup(
            t("memory.group.rules"),
            t("memory.group.rulesDescription"),
            ruleMemories,
          )}
          {renderUnmanagedMemoryGroup(unmanagedMemories)}
        </>
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
