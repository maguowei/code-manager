import { useState, useCallback } from "react";
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
}

function ProviderPage({ providers, onProvidersChange }: ProviderPageProps) {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

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
        {providers.length === 0 ? (
          <div className="empty-state">
            <p>{t("providers.empty")}</p>
            <p className="empty-hint">{t("providers.emptyHint")}</p>
          </div>
        ) : (
          <div className="provider-list">
            {providers.map((provider) => (
              <ProviderItem
                key={provider.id}
                provider={provider}
                isEditing={isDrawerOpen && editingProvider?.id === provider.id}
                onEdit={handleEdit}
                onDelete={(id) => setPendingDeleteId(id)}
                onReset={handleReset}
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
