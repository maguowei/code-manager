import { useState, useCallback, useRef, DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Provider, ProviderModel } from "../types";
import { useI18n } from "../i18n";
import { useToast } from "../hooks/useToast";
import ProviderItem from "./ProviderItem";
import ProviderEditor from "./ProviderEditor";
import Drawer from "./Drawer";
import ConfirmDialog from "./ConfirmDialog";
import { PlusIcon } from "./Icons";
import useEscapeKey from "../hooks/useEscapeKey";

interface ProviderPageProps {
  providers: Provider[];
  onProvidersChange: () => void;
  onReorder: (ids: string[]) => void;
}

function ProviderPage({ providers, onProvidersChange, onReorder }: ProviderPageProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // 拖拽状态
  const dragIndexRef = useRef<number | null>(null);
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
    const rect = e.currentTarget.getBoundingClientRect();
    const position = e.clientY < rect.top + rect.height / 2 ? "above" : "below";
    setDragState((prev) => {
      if (prev.overIndex === index && prev.overPosition === position) return prev;
      return { ...prev, overIndex: index, overPosition: position };
    });
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>, index: number) => {
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
    const rect = e.currentTarget.getBoundingClientRect();
    const insertAfter = e.clientY >= rect.top + rect.height / 2;
    const newProviders = [...providers];
    const [dragged] = newProviders.splice(fromIndex, 1);
    let targetIndex = dropIndex;
    if (fromIndex < dropIndex) targetIndex -= 1;
    if (insertAfter) targetIndex += 1;
    newProviders.splice(targetIndex, 0, dragged);
    onReorder(newProviders.map((p) => p.id));
    handleDragEnd();
  }, [providers, onReorder, handleDragEnd]);

  useEscapeKey(
    useCallback(() => {
      setEditingProvider(null);
      setIsDrawerOpen(false);
    }, []),
    isDrawerOpen
  );

  function handleEdit(provider: Provider) {
    setEditingProvider(provider);
    setIsDrawerOpen(true);
  }

  function handleAdd() {
    setEditingProvider(null);
    setIsDrawerOpen(true);
  }

  async function handleSave(data: {
    name: string;
    slug: string;
    baseUrl: string;
    docUrl: string;
    models: ProviderModel[];
  }) {
    try {
      const payload = {
        name: data.name,
        slug: data.slug,
        baseUrl: data.baseUrl,
        docUrl: data.docUrl || null,
        models: data.models,
      };
      if (editingProvider) {
        await invoke("update_provider", { id: editingProvider.id, data: payload });
      } else {
        await invoke("add_provider", { data: payload });
      }
      onProvidersChange();
      setIsDrawerOpen(false);
      setEditingProvider(null);
      showToast(t("toast.providerSaved"));
    } catch (error) {
      showToast(t("toast.providerSaveError"), "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await invoke("delete_provider", { id });
      onProvidersChange();
      showToast(t("toast.providerDeleted"));
    } catch (error) {
      showToast(String(error) || t("toast.providerDeleteError"), "error");
    }
  }

  async function handleReset(id: string) {
    try {
      await invoke("reset_provider", { id });
      onProvidersChange();
      showToast(t("toast.providerSaved"));
    } catch {
      showToast(t("toast.providerResetError"), "error");
    }
  }

  function handleResetOrder() {
    const sorted = [...providers].sort((a, b) => a.id.localeCompare(b.id));
    onReorder(sorted.map((p) => p.id));
  }

  return (
    <>
      <div className={`list-section ${isDrawerOpen ? "compressed" : ""}`}>
        <div className="page-header">
          <h1 className="page-title">{t("providers.title")}</h1>
        </div>
        <button className="add-config-btn" onClick={handleAdd}>
          <PlusIcon />
          <span>{t("providers.addProvider")}</span>
        </button>
        {providers.length > 1 && (
          <button className="add-config-btn secondary" onClick={handleResetOrder}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.27"/>
            </svg>
            <span>{t("providers.resetOrder")}</span>
          </button>
        )}
        {providers.length === 0 ? (
          <div className="empty-state">
            <p>{t("providers.empty")}</p>
            <p className="empty-hint">{t("providers.emptyHint")}</p>
          </div>
        ) : (
          <div className={`provider-list${dragState.draggingIndex !== null ? " is-dragging" : ""}`} onDragOver={(e) => e.preventDefault()}>
            {providers.map((provider, index) => (
              <ProviderItem
                key={provider.id}
                provider={provider}
                index={index}
                isEditing={isDrawerOpen && editingProvider?.id === provider.id}
                isDragging={dragState.draggingIndex === index}
                dragOverPosition={dragState.overIndex === index ? dragState.overPosition : null}
                onEdit={handleEdit}
                onDelete={(id) => setPendingDeleteId(id)}
                onReset={handleReset}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>

      {/* 编辑/新建抽屉：条件渲染，Drawer 无 isOpen prop */}
      {isDrawerOpen && (
        <Drawer onClose={() => { setIsDrawerOpen(false); setEditingProvider(null); }}>
          <ProviderEditor
            provider={editingProvider}
            onSave={handleSave}
            onClose={() => { setIsDrawerOpen(false); setEditingProvider(null); }}
          />
        </Drawer>
      )}

      {/* 删除确认对话框 */}
      {pendingDeleteId && (
        <ConfirmDialog
          title={t("providers.delete")}
          message={t("providers.deleteConfirm")}
          confirmText={t("confirm.delete")}
          cancelText={t("confirm.cancel")}
          danger
          onConfirm={() => { handleDelete(pendingDeleteId); setPendingDeleteId(null); }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </>
  );
}

export default ProviderPage;
