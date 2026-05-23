import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FolderInput,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { cn } from "@/lib/utils";
import useTauriEvent from "../hooks/useTauriEvent";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import type {
  ClaudeDirectoryChangedEvent,
  Memory,
  MemoryDeletePreview,
  MemoryDirectoryImportResult,
  MemoryDirectoryImportSkipReason,
  MemoryState,
  UnmanagedMemory,
} from "../types";
import ConfirmAlertDialog from "./ConfirmAlertDialog";
import EmptyState from "./EmptyState";
import type { EditorExitGuard } from "./editor-exit-guard";
import { LIST_DETAIL_DRAWER_OFFSET_CLASS } from "./layout-size-classes";
import MemoryEditor, { type MemoryEditorHandle } from "./MemoryEditor";
import MemoryItem from "./MemoryItem";
import PageHeader from "./PageHeader";
import UnmanagedMemoryItem from "./UnmanagedMemoryItem";
import UnsavedChangesAlertDialog from "./UnsavedChangesAlertDialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./ui/sheet";

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

function formatImportResultSummary(template: string, importedCount: number, skippedCount: number) {
  return template
    .replace("{imported}", String(importedCount))
    .replace("{skipped}", String(skippedCount));
}

const memoryImportSkipReasonLabels: Record<MemoryDirectoryImportSkipReason, TranslationKey> = {
  duplicateClaude: "memory.importResultReason.duplicateClaude",
  duplicateRulePath: "memory.importResultReason.duplicateRulePath",
  unsupportedSymlink: "memory.importResultReason.unsupportedSymlink",
  invalidRulePath: "memory.importResultReason.invalidRulePath",
  readError: "memory.importResultReason.readError",
};

function formatImportCount(template: string, count: number) {
  return template.replace("{count}", String(count));
}

interface MemoryImportResultDialogProps {
  result: MemoryDirectoryImportResult;
  onConfirm: () => void;
}

function MemoryImportResultDialog({ result, onConfirm }: MemoryImportResultDialogProps) {
  const { t } = useI18n();
  const hasImported = result.imported.length > 0;
  const hasSkipped = result.skipped.length > 0;
  const isEmpty = !hasImported && !hasSkipped;
  const isAllSuccess = hasImported && !hasSkipped;
  const isAllFailed = !hasImported && hasSkipped;
  const statusTitle = isAllSuccess
    ? t("memory.importResultAllSuccessTitle")
    : isAllFailed
      ? t("memory.importResultAllFailedTitle")
      : hasSkipped
        ? t("memory.importResultPartialTitle")
        : t("memory.importResultEmptyTitle");
  const statusDescription = isAllSuccess
    ? formatImportResultSummary(
        t("memory.importResultImportedCount"),
        result.imported.length,
        result.skipped.length,
      )
    : hasSkipped
      ? formatImportResultSummary(
          t("memory.importResultSummary"),
          result.imported.length,
          result.skipped.length,
        )
      : t("memory.importResultEmptyDescription");
  const StatusIcon = hasSkipped || isEmpty ? CircleAlert : CheckCircle2;
  const summaryIconClass = hasSkipped
    ? "text-destructive"
    : isEmpty
      ? "text-muted-foreground"
      : "text-primary";

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="memory-import-result-dialog sm:max-w-xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("memory.importResultTitle")}</DialogTitle>
          <DialogDescription>{t("memory.importResultDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 py-0 shadow-none">
            <CardHeader className="grid-cols-[auto_1fr_auto] grid-rows-1 items-center gap-x-3 px-4 py-4">
              <StatusIcon className={cn("size-5 shrink-0", summaryIconClass)} aria-hidden="true" />
              <div className="min-w-0">
                <CardTitle>{statusTitle}</CardTitle>
                <CardDescription className="mt-1">{statusDescription}</CardDescription>
              </div>
              <CardAction className="col-start-3 row-span-1 row-start-1 flex flex-wrap justify-end gap-2">
                {hasImported ? (
                  <Badge variant="secondary">
                    {formatImportCount(
                      t("memory.importResultSuccessCount"),
                      result.imported.length,
                    )}
                  </Badge>
                ) : null}
                {hasSkipped ? (
                  <Badge variant="destructive">
                    {formatImportCount(t("memory.importResultFailureCount"), result.skipped.length)}
                  </Badge>
                ) : null}
              </CardAction>
            </CardHeader>
          </Card>

          {hasImported ? (
            <Card className="gap-0 py-0 shadow-none">
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                  <span>{t("memory.importResultSuccessTitle")}</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="outline">
                    {formatImportCount(t("memory.importResultItemCount"), result.imported.length)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0 pb-1">
                <ScrollArea className="max-h-44">
                  <ul className="m-0 flex flex-col p-0">
                    {result.imported.map((item) => (
                      <li
                        key={`${item.targetType}-${item.sourcePath}`}
                        className="grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-3 border-t border-border/70 px-4 py-2.5"
                      >
                        <CheckCircle2 className="size-3.5 text-primary" aria-hidden="true" />
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {item.name}
                          </span>
                          <code className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                            {item.rulePath ?? item.sourcePath}
                          </code>
                        </div>
                        <Badge variant="secondary">
                          {t(
                            item.targetType === "claude"
                              ? "memory.importResultTarget.claude"
                              : "memory.importResultTarget.rule",
                          )}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}

          {hasSkipped ? (
            <Card className="gap-0 py-0 shadow-none">
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2">
                  <CircleAlert className="size-4 text-destructive" aria-hidden="true" />
                  <span>{t("memory.importResultFailureTitle")}</span>
                </CardTitle>
                <CardAction>
                  <Badge variant="destructive">
                    {formatImportCount(t("memory.importResultItemCount"), result.skipped.length)}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="px-0 pb-1">
                <ScrollArea className="max-h-52">
                  <ul className="m-0 flex flex-col p-0">
                    {result.skipped.map((item) => (
                      <li
                        key={`${item.sourcePath}-${item.reason}`}
                        className="grid min-w-0 grid-cols-[auto_1fr_auto] items-start gap-3 border-t border-border/70 px-4 py-2.5"
                      >
                        <CircleAlert
                          className="mt-0.5 size-3.5 text-destructive"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <code className="block truncate font-mono text-sm text-foreground">
                            {item.sourcePath}
                          </code>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t(memoryImportSkipReasonLabels[item.reason])}
                          </span>
                          {item.detail ? (
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                          ) : null}
                        </div>
                        <Badge variant="outline">{t("memory.importResultFailedBadge")}</Badge>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={onConfirm}>
            {t("memory.importResultConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

interface MemoryPageProps {
  onDrawerChange?: (isOpen: boolean) => void;
  onEditorExitGuardChange?: (guard: EditorExitGuard | null) => void;
}

function MemoryPage({ onDrawerChange, onEditorExitGuardChange }: MemoryPageProps) {
  const { language, t } = useI18n();
  const { showToast } = useToast();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [unmanagedMemories, setUnmanagedMemories] = useState<UnmanagedMemory[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportingDirectory, setIsImportingDirectory] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [pendingEditorExitAction, setPendingEditorExitAction] = useState<(() => void) | null>(null);
  const [isSavingEditorExit, setIsSavingEditorExit] = useState(false);
  const [directoryImportResult, setDirectoryImportResult] =
    useState<MemoryDirectoryImportResult | null>(null);
  const memoryEditorRef = useRef<MemoryEditorHandle | null>(null);

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
      } catch (err) {
        showOperationError(showToast, t(errorMessage), err);
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
      return true;
    } catch (err) {
      showOperationError(showToast, t("toast.memoryAddError"), err);
      return false;
    }
  }

  async function handleUpdate(data: MemoryPayload) {
    if (!editingMemory) return false;
    try {
      const state = await invoke<MemoryState>("update_memory", { id: editingMemory.id, data });
      setEditingMemory(null);
      setIsModalOpen(false);
      applyMemoryState(state);
      showToast(t("toast.memorySaved"));
      return true;
    } catch (err) {
      showOperationError(showToast, t("toast.memorySaveError"), err);
      return false;
    }
  }

  async function handleDelete(id: string) {
    try {
      const state = await invoke<MemoryState>("delete_memory", { id });
      applyMemoryState(state);
      showToast(t("toast.memoryDeleted"));
    } catch (err) {
      showOperationError(showToast, t("toast.memoryDeleteError"), err);
    }
  }

  async function handleRequestDelete(id: string) {
    try {
      const preview = await invoke<MemoryDeletePreview>("preview_delete_memory", { id });
      setPendingDelete({ id, cleanupDirs: preview.cleanupDirs ?? [] });
    } catch (err) {
      showOperationError(showToast, t("toast.memoryDeletePreviewError"), err);
    }
  }

  async function handleToggle(id: string) {
    try {
      const state = await invoke<MemoryState>("toggle_memory", { id });
      applyMemoryState(state);
    } catch (err) {
      showOperationError(showToast, t("toast.memoryToggleError"), err);
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
    } catch (err) {
      showOperationError(showToast, t("toast.memoryDuplicateError"), err);
    }
  }

  async function handleImport(memory: UnmanagedMemory) {
    try {
      const state = await invoke<MemoryState>("import_unmanaged_memory", {
        source: { targetType: memory.targetType, rulePath: memory.rulePath },
      });
      applyMemoryState(state);
      showToast(t("toast.memoryImported"));
    } catch (err) {
      showOperationError(showToast, t("toast.memoryImportError"), err);
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
      setDirectoryImportResult(result);
    } catch (err) {
      showOperationError(showToast, t("toast.memoryDirectoryImportError"), err);
    } finally {
      setIsImportingDirectory(false);
    }
  }

  const requestEditorExit = useCallback((action: () => void) => {
    if (memoryEditorRef.current?.isDirty()) {
      setPendingEditorExitAction(() => action);
      return;
    }

    action();
  }, []);

  async function saveAndRunPendingEditorExit() {
    const action = pendingEditorExitAction;
    const editor = memoryEditorRef.current;
    if (!action || !editor?.canSave()) {
      return;
    }

    setIsSavingEditorExit(true);
    try {
      const saved = await editor.save();
      if (saved) {
        setPendingEditorExitAction(null);
        action();
      }
    } finally {
      setIsSavingEditorExit(false);
    }
  }

  function discardAndRunPendingEditorExit() {
    const action = pendingEditorExitAction;
    setPendingEditorExitAction(null);
    action?.();
  }

  useEffect(() => {
    if (!onEditorExitGuardChange) {
      return;
    }

    if (!isModalOpen) {
      onEditorExitGuardChange(null);
      return;
    }

    onEditorExitGuardChange({ requestExit: requestEditorExit });
    return () => onEditorExitGuardChange(null);
  }, [isModalOpen, onEditorExitGuardChange, requestEditorExit]);

  function openAddModal() {
    requestEditorExit(() => {
      setEditingMemory(null);
      setIsModalOpen(true);
      onDrawerChange?.(true);
    });
  }

  function openEditModal(memory: Memory) {
    requestEditorExit(() => {
      setEditingMemory(memory);
      setIsModalOpen(true);
      onDrawerChange?.(true);
    });
  }

  function closeModal() {
    setEditingMemory(null);
    setIsModalOpen(false);
    setPendingEditorExitAction(null);
    onDrawerChange?.(false);
  }

  const claudeMemories = memories.filter((memory) => memory.targetType === "claude");
  const ruleMemories = memories.filter((memory) => memory.targetType === "rule");
  const hasAnyMemory = memories.length > 0 || unmanagedMemories.length > 0;
  const claudeMemoryDocsUrl = useMemo(() => getClaudeMemoryDocsUrl(language), [language]);

  const handleOpenDocs = useCallback(async () => {
    try {
      await openUrl(claudeMemoryDocsUrl);
    } catch (err) {
      showOperationError(showToast, t("memory.openDocsError"), err);
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
      <section className="memory-group flex flex-col gap-3">
        <div className="memory-group-header flex min-w-0 flex-col gap-1 px-1">
          <h2 className="m-0 text-base leading-snug font-bold text-foreground">{title}</h2>
          <p className="m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        </div>
        <div className="list-container flex flex-col gap-3">
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
      <section className="memory-group memory-group-unmanaged flex flex-col gap-3">
        <div className="memory-group-header flex min-w-0 flex-col gap-1 px-1">
          <h2 className="m-0 text-base leading-snug font-bold text-foreground">
            {t("memory.group.unmanaged")}
          </h2>
          <p className="m-0 text-xs leading-normal text-muted-foreground [overflow-wrap:anywhere]">
            {t("memory.group.unmanagedDescription")}
          </p>
        </div>
        <div className="list-container flex flex-col gap-3">
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
    <div
      className={cn("list-page group/list flex min-h-full flex-col", isModalOpen && "compressed")}
    >
      <PageHeader
        title={t("nav.memory")}
        surface="secondary"
        variant="list"
        actionsClassName="memory-page-actions"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="memory-docs-link border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
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
              className="memory-import-directory-btn border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
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
                {isImportingDirectory
                  ? t("memory.importingDirectory")
                  : t("memory.importDirectory")}
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="memory-refresh-btn border-border bg-transparent px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:bg-accent hover:text-foreground"
              aria-label={isRefreshing ? t("memory.refreshing") : t("memory.refresh")}
              aria-busy={isRefreshing}
              title={isRefreshing ? t("memory.refreshing") : t("memory.refresh")}
              onClick={handleRefreshMemories}
              disabled={isRefreshing}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              <span>{isRefreshing ? t("memory.refreshing") : t("memory.refresh")}</span>
            </Button>
          </>
        }
      />

      {/* 添加按钮 */}
      <Button
        type="button"
        className="mx-2 mt-4 mb-3 h-auto gap-2 rounded-lg p-3.5 text-base font-semibold"
        onClick={openAddModal}
      >
        <Plus className="size-4" aria-hidden="true" />
        <span>{t("memory.addMemory")}</span>
      </Button>

      {/* 记忆列表 */}
      {!hasAnyMemory ? (
        <EmptyState title={t("memory.empty")} hint={t("memory.emptyHint")} icon={BookOpen} />
      ) : (
        <div className="memory-groups flex flex-col gap-5 p-4">
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
        </div>
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
                  className="memory-delete-confirm__warning rounded-md border border-destructive bg-destructive/10 p-3 text-destructive"
                  role="alert"
                >
                  <div className="memory-delete-confirm__warning-title mb-2 font-bold">
                    {t("confirm.deleteMemoryCleanupDirectories")}
                  </div>
                  <ul className="memory-delete-confirm__dir-list m-0 flex flex-col gap-1 pl-4">
                    {pendingDelete.cleanupDirs.map((dir) => (
                      <li key={dir}>
                        <code className="memory-delete-confirm__dir font-mono text-xs [overflow-wrap:anywhere]">
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

      {directoryImportResult ? (
        <MemoryImportResultDialog
          result={directoryImportResult}
          onConfirm={() => setDirectoryImportResult(null)}
        />
      ) : null}

      {/* 弹窗 */}
      {isModalOpen && (
        <Sheet open onOpenChange={(open) => !open && requestEditorExit(closeModal)}>
          <SheetContent
            side="right"
            showCloseButton={false}
            className={cn(
              LIST_DETAIL_DRAWER_OFFSET_CLASS,
              "w-auto border-l-0 bg-secondary p-0 shadow-floating sm:max-w-none",
            )}
          >
            <SheetTitle className="sr-only">{t("memory.title")}</SheetTitle>
            <SheetDescription className="sr-only">{t("memory.title")}</SheetDescription>
            <MemoryEditor
              key={editingMemory?.id ?? "new-memory"}
              ref={memoryEditorRef}
              memory={editingMemory}
              onSave={editingMemory ? handleUpdate : handleAdd}
              onClose={() => requestEditorExit(closeModal)}
            />
          </SheetContent>
        </Sheet>
      )}

      {pendingEditorExitAction && (
        <UnsavedChangesAlertDialog
          canSave={memoryEditorRef.current?.canSave() ?? false}
          isSaving={isSavingEditorExit}
          onCancel={() => setPendingEditorExitAction(null)}
          onDiscard={discardAndRunPendingEditorExit}
          onSaveAndExit={() => {
            void saveAndRunPendingEditorExit();
          }}
        />
      )}
    </div>
  );
}

export default MemoryPage;
