import { ArrowRight, Lock, RotateCcw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "../../i18n";
import { TYPOGRAPHY } from "../typography-classes";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { SettingsFieldDefinition } from "./settings-form-registry";

// 与 ProfileEditor.readBehaviorFieldState 返回结构对齐的最小子集
interface ProviderFieldState {
  /** 用户的显式覆盖值（可能为空） */
  value: string;
  /** 供应商提供的继承默认值 */
  providerDefault: string;
  /** 值来源：用户覆盖 / 继承自供应商 / 未设置 */
  source: "override" | "inherited" | "unset";
}

interface PreviewItem {
  key: string;
  label: string;
  before: string;
  after: string;
}

interface ProviderDefaultsActionsProps {
  /** 「模型与行为」分区中映射到 env 的字段定义 */
  fields: SettingsFieldDefinition[];
  readFieldState: (field: SettingsFieldDefinition) => ProviderFieldState;
  /** 批量清空覆盖值，使字段重新跟随供应商默认 */
  onRestoreDefaults: () => void;
  /** 批量把供应商当前默认值固化为本配置显式值 */
  onFreezeDefaults: () => void;
}

type DialogKind = "restore" | "freeze";

function ProviderDefaultsActions({
  fields,
  readFieldState,
  onRestoreDefaults,
  onFreezeDefaults,
}: ProviderDefaultsActionsProps) {
  const { language, t } = useI18n();
  const [openDialog, setOpenDialog] = useState<DialogKind | null>(null);

  // 恢复预览：当前有覆盖值且供应商有默认 -> 清空后回到供应商默认值
  const restoreItems: PreviewItem[] = fields.flatMap((field) => {
    const state = readFieldState(field);
    if (state.source === "override" && state.providerDefault) {
      return [
        {
          key: field.key,
          label: field.label[language],
          before: state.value,
          after: state.providerDefault,
        },
      ];
    }
    return [];
  });

  // 固化预览：仅处理当前继承自供应商的字段，写入供应商默认值作为固定值
  // （已覆盖的字段本就是显式值、不随供应商变化，无需固化）
  const freezeItems: PreviewItem[] = fields.flatMap((field) => {
    const state = readFieldState(field);
    if (state.source === "inherited" && state.providerDefault) {
      return [
        {
          key: field.key,
          label: field.label[language],
          before: t("profiles.editor.fieldSource.inherited"),
          after: state.providerDefault,
        },
      ];
    }
    return [];
  });

  const dialogConfig =
    openDialog === "restore"
      ? {
          title: t("profiles.editor.providerDefaults.restoreTitle"),
          description: t("profiles.editor.providerDefaults.restoreDescription"),
          empty: t("profiles.editor.providerDefaults.restoreEmpty"),
          items: restoreItems,
          onConfirm: onRestoreDefaults,
        }
      : openDialog === "freeze"
        ? {
            title: t("profiles.editor.providerDefaults.freezeTitle"),
            description: t("profiles.editor.providerDefaults.freezeDescription"),
            empty: t("profiles.editor.providerDefaults.freezeEmpty"),
            items: freezeItems,
            onConfirm: onFreezeDefaults,
          }
        : null;

  function closeDialog() {
    setOpenDialog(null);
  }

  function handleConfirm() {
    dialogConfig?.onConfirm();
    closeDialog();
  }

  return (
    <span className="inline-flex items-center gap-2" data-slot="provider-defaults-actions">
      <Button
        type="button"
        variant="outline"
        className="min-h-[34px] gap-1.5 px-3 text-xs font-semibold"
        onClick={() => setOpenDialog("restore")}
      >
        <RotateCcw className="size-3.5" aria-hidden="true" />
        <span>{t("profiles.editor.providerDefaults.restore")}</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        className="min-h-[34px] gap-1.5 px-3 text-xs font-semibold"
        onClick={() => setOpenDialog("freeze")}
      >
        <Lock className="size-3.5" aria-hidden="true" />
        <span>{t("profiles.editor.providerDefaults.freeze")}</span>
      </Button>

      <Dialog open={openDialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          {dialogConfig ? (
            <>
              <DialogHeader>
                <DialogTitle>{dialogConfig.title}</DialogTitle>
                <DialogDescription>{dialogConfig.description}</DialogDescription>
              </DialogHeader>
              {dialogConfig.items.length === 0 ? (
                <p className={cn(TYPOGRAPHY.body, "text-muted-foreground")}>{dialogConfig.empty}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dialogConfig.items.map((item) => (
                    <li
                      key={item.key}
                      className={cn("flex flex-wrap items-center gap-2", TYPOGRAPHY.body)}
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                        <span className="truncate">{item.before}</span>
                        <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate font-medium text-foreground">{item.after}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeDialog}>
                  {t("profiles.editor.providerDefaults.cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={dialogConfig.items.length === 0}
                  onClick={handleConfirm}
                >
                  {t("profiles.editor.providerDefaults.confirm")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </span>
  );
}

export default ProviderDefaultsActions;
