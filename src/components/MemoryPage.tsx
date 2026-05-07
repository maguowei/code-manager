import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BookOpen, ExternalLink, FolderInput, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import type {
  ClaudeDirectoryChangedEvent,
  Memory,
  MemoryDeletePreview,
  MemoryDirectoryImportResult,
  MemoryState,
  UnmanagedMemory,
} from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import MemoryEditor from "./MemoryEditor";
import MemoryItem from "./MemoryItem";
import UnmanagedMemoryItem from "./UnmanagedMemoryItem";
import { Button } from "./ui/button";
import { Sheet, SheetContent } from "./ui/sheet";

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

function isMemoryFileChangePath(path: string) {
  return path === "CLAUDE.md" || path === "rules" || path.startsWith("rules/");
}

function formatDirectoryImportSummary(
  template: string,
  importedCount: number,
  skippedCount: number,
) {
  return template
    .replace("{imported}", String(importedCount))
    .replace("{skipped}", String(skippedCount));
}

type PendingDelete = {
  id: string;
  cleanupDirs: string[];
};

type RefreshMemoriesOptions = {
  errorMessage: TranslationKey;
  setBusy?: boolean;
  successMessage?: TranslationKey;
};

function MemoryPage({ onDrawerChange }: { onDrawerChange?: (isOpen: boolean) => void }) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [unmanagedMemories, setUnmanagedMemories] = useState<UnmanagedMemory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportingDirectory, setIsImportingDirectory] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const applyMemoryState = useCallback((state: MemoryState) => {
    setMemories(state.memories);
    setUnmanagedMemories(state.unmanagedMemories ?? []);
  }, []);

  const refreshMemories = useCallback(
    async ({ errorMessage, setBusy, successMessage }: RefreshMemoriesOptions) => {
      if (setBusy) {
        setIsRefreshing(true);
      }
      try {
        const state = await invoke<MemoryState>("get_memories");
        applyMemoryState(state);
        if (successMessage) {
          showToast(t(successMessage));
        }
      } catch (_err) {
        showToast(t(errorMessage), "error");
      } finally {
        if (setBusy) {
          setIsRefreshing(false);
        }
      }
    },
    [applyMemoryState, showToast, t],
  );

  useEffect(() => {
    refreshMemories({ errorMessage: "toast.memoryLoadError" });
  }, [refreshMemories]);

  useTauriEvent<ClaudeDirectoryChangedEvent>("claude-directory-changed", (event) => {
    if (event.paths.some(isMemoryFileChangePath)) {
      refreshMemories({ errorMessage: "toast.memoryRefreshError" });
    }
  });

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

  async function handleRequestDelete(id: string) {
    try {
      const preview = await invoke<MemoryDeletePreview>("preview_delete_memory", { id });
      setPendingDelete({ id, cleanupDirs: preview.cleanupDirs ?? [] });
    } catch (_err) {
      showToast(t("toast.memoryDeletePreviewError"), "error");
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

  async function handleDuplicate(id: string) {
    try {
      const state = await invoke<MemoryState>("duplicate_memory", {
        id,
        nameSuffix: t("memory.duplicateSuffix"),
      });
      applyMemoryState(state);
      showToast(t("toast.memoryDuplicated"));
    } catch (_err) {
      showToast(t("toast.memoryDuplicateError"), "error");
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

  async function handleImportDirectory() {
    setIsImportingDirectory(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("memory.importDirectoryDialogTitle"),
      });
      const sourceDir = Array.isArray(selected) ? selected[0] : selected;
      if (!sourceDir) {
        return;
      }

      const result = await invoke<MemoryDirectoryImportResult>("import_memories_from_directory", {
        sourceDir,
      });
      applyMemoryState(result.state);
      if (result.imported.length === 0 && result.skipped.length === 0) {
        showToast(t("toast.memoryDirectoryImportEmpty"));
        return;
      }
      showToast(
        formatDirectoryImportSummary(
          t("toast.memoryDirectoryImportSummary"),
          result.imported.length,
          result.skipped.length,
        ),
      );
    } catch (_err) {
      showToast(t("toast.memoryDirectoryImportError"), "error");
    } finally {
      setIsImportingDirectory(false);
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

  const handleRefreshMemories = useCallback(() => {
    refreshMemories({
      errorMessage: "toast.memoryRefreshError",
      setBusy: true,
      successMessage: "toast.memoryRefreshed",
    });
  }, [refreshMemories]);

  function renderMemoryGroup(title: string, description: string, items: Memory[]) {
    if (items.length === 0) return null;
    return (
      <section className="memory-group mt-5 flex flex-col gap-3 first-of-type:mt-0">
        <div className="memory-group-header flex min-w-0 flex-col gap-1 px-2">
          <h2 className="m-0 text-[length:var(--font-lg)] leading-snug font-bold text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="m-0 text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)] [overflow-wrap:anywhere]">
            {description}
          </p>
        </div>
        <div className="list-container">
          {items.map((memory) => (
            <MemoryItem
              key={memory.id}
              memory={memory}
              isEditing={isModalOpen && editingMemory?.id === memory.id}
              onToggle={() => handleToggle(memory.id)}
              onEdit={() => openEditModal(memory)}
              onDuplicate={() => handleDuplicate(memory.id)}
              onDelete={() => handleRequestDelete(memory.id)}
            />
          ))}
        </div>
      </section>
    );
  }

  function renderUnmanagedMemoryGroup(items: UnmanagedMemory[]) {
    if (items.length === 0) return null;
    return (
      <section className="memory-group memory-group-unmanaged mt-5 flex flex-col gap-3 first-of-type:mt-0">
        <div className="memory-group-header flex min-w-0 flex-col gap-1 px-2">
          <h2 className="m-0 text-[length:var(--font-lg)] leading-snug font-bold text-[var(--text-primary)]">
            {t("memory.group.unmanaged")}
          </h2>
          <p className="m-0 text-[length:var(--font-sm)] leading-normal text-[var(--text-muted)] [overflow-wrap:anywhere]">
            {t("memory.group.unmanagedDescription")}
          </p>
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
    <div className={cn("list-page group/list", isModalOpen && "compressed")}>
      {/* 页面标题栏 */}
      <div className="page-header">
        <h1 className="page-title">{t("nav.memory")}</h1>
        <div className="memory-page-actions flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="memory-docs-link border-[var(--border-default)] bg-transparent px-2.5 text-[length:var(--font-sm)] font-semibold text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label={t("memory.openDocsAriaLabel")}
            title={t("memory.openDocsAriaLabel")}
            onClick={handleOpenDocs}
          >
            <span>{t("memory.openDocs")}</span>
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="memory-import-directory-btn border-[var(--border-default)] bg-transparent px-2.5 text-[length:var(--font-sm)] font-semibold text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label={
              isImportingDirectory ? t("memory.importingDirectory") : t("memory.importDirectory")
            }
            aria-busy={isImportingDirectory}
            title={
              isImportingDirectory
                ? t("memory.importingDirectory")
                : t("memory.importDirectoryHint")
            }
            onClick={handleImportDirectory}
            disabled={isImportingDirectory}
          >
            <FolderInput className="size-3.5" aria-hidden="true" />
            <span>
              {isImportingDirectory ? t("memory.importingDirectory") : t("memory.importDirectory")}
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="memory-refresh-btn border-[var(--border-default)] bg-transparent px-2.5 text-[length:var(--font-sm)] font-semibold text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            aria-label={isRefreshing ? t("memory.refreshing") : t("memory.refresh")}
            aria-busy={isRefreshing}
            title={isRefreshing ? t("memory.refreshing") : t("memory.refresh")}
            onClick={handleRefreshMemories}
            disabled={isRefreshing}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span>{isRefreshing ? t("memory.refreshing") : t("memory.refresh")}</span>
          </Button>
        </div>
      </div>

      {/* 添加按钮 */}
      <Button
        type="button"
        className="add-config-btn gap-1.5 bg-[linear-gradient(135deg,var(--accent-blue),var(--accent-blue-dark))] font-semibold text-white shadow-[var(--shadow-sm),var(--shadow-blue-sm)] hover:-translate-y-px hover:shadow-[var(--shadow-md),var(--shadow-blue-md)]"
        onClick={openAddModal}
      >
        <Plus className="size-[18px]" aria-hidden="true" />
        <span>{t("memory.addMemory")}</span>
      </Button>

      {/* 记忆列表 */}
      {!hasAnyMemory ? (
        <div className="list-empty">
          <div className="empty-icon">
            <BookOpen className="size-12" strokeWidth={1.5} aria-hidden="true" />
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
      {pendingDelete && (
        <ConfirmAlertDialog
          title={t("confirm.deleteMemoryTitle")}
          message={
            <div className="memory-delete-confirm flex flex-col gap-3">
              <p className="m-0">{t("confirm.deleteMemoryMessage")}</p>
              {pendingDelete.cleanupDirs.length > 0 && (
                <div
                  className="memory-delete-confirm__warning rounded-[var(--radius-md)] border border-[var(--accent-red)] bg-[var(--accent-red-bg)] p-3 text-[var(--accent-red)]"
                  role="alert"
                >
                  <div className="memory-delete-confirm__warning-title mb-2 font-bold">
                    {t("confirm.deleteMemoryCleanupDirectories")}
                  </div>
                  <ul className="memory-delete-confirm__dir-list m-0 flex flex-col gap-1 pl-4">
                    {pendingDelete.cleanupDirs.map((dir) => (
                      <li key={dir}>
                        <code className="memory-delete-confirm__dir font-mono text-[length:var(--font-sm)] [overflow-wrap:anywhere]">
                          {dir}
                        </code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          }
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => {
            handleDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {/* 弹窗 */}
      {isModalOpen && (
        <Sheet open onOpenChange={(open) => !open && closeModal()}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className="left-[calc(var(--sidebar-width)+280px)] w-auto border-l-0 bg-[var(--bg-elevated)] p-0 shadow-[-4px_0_24px_rgb(0_0_0_/_0.2)] sm:max-w-none max-[1000px]:left-[var(--sidebar-width)] max-[700px]:left-[var(--sidebar-width-small)]"
          >
            <MemoryEditor
              memory={editingMemory}
              onSave={editingMemory ? handleUpdate : handleAdd}
              onClose={closeModal}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

export default MemoryPage;
