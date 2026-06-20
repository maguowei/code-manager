import { ArrowLeft } from "lucide-react";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";
import { useI18n } from "../i18n";
import type { LocalizedText, Provider } from "../types";
import { normalizeLocalizedText } from "./config-workspace-utils";
import {
  EDITOR_CONTROL_SURFACE_CLASS,
  EditorDescription,
  EditorEnvHint,
  EditorField,
  EditorFieldGrid,
  EditorLabelRow,
  EditorSection,
} from "./editor-layout";
import RequiredBadge from "./profile-editor/RequiredBadge";
import { TYPOGRAPHY } from "./typography-classes";
import { Button } from "./ui/button";
import { Form } from "./ui/form";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

/** ProviderEditor 保存数据结构（段 B：只含元数据 + env，无继承/settings） */
export interface ProviderEditorSaveData {
  id?: string;
  name: string;
  localizedName?: LocalizedText;
  description: string;
  docUrl?: string;
  models?: Provider["models"];
  modelSuggestions: string[];
  /** 供应商连接与模型映射环境变量（扁平键值对） */
  env: Record<string, string>;
}

export interface ProviderEditorHandle {
  isDirty: () => boolean;
  canSave: () => boolean;
  save: () => Promise<boolean>;
}

interface ProviderEditorProps {
  provider: Provider | null;
  onSave: (data: ProviderEditorSaveData) => Promise<boolean> | boolean;
  onClose: () => void;
}

function resolveProviderLocalizedName(provider: Provider | null): LocalizedText {
  return normalizeLocalizedText(provider?.localizedName, provider?.name ?? "");
}

function buildProviderLocalizedName(nameZh: string, nameEn: string): LocalizedText | undefined {
  const zh = nameZh.trim();
  const en = nameEn.trim();
  if (!zh && !en) {
    return undefined;
  }
  return normalizeLocalizedText({ zh, en }, en || zh);
}

function buildProviderSaveData(
  provider: Provider | null,
  nameZh: string,
  nameEn: string,
  description: string,
  docUrl: string,
  modelSuggestions: string,
  env: Record<string, string>,
): ProviderEditorSaveData | null {
  const localizedName = buildProviderLocalizedName(nameZh, nameEn);
  if (!localizedName) {
    return null;
  }

  return {
    id: provider?.id,
    name: localizedName.en || localizedName.zh,
    localizedName,
    description: description.trim(),
    docUrl: docUrl.trim() || undefined,
    models: provider?.models,
    modelSuggestions: modelSuggestions
      .split(",")
      .map((model) => model.trim())
      .filter(Boolean),
    env,
  };
}

function providerSaveDataEquals(
  left: ProviderEditorSaveData | null,
  right: ProviderEditorSaveData | null,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 从 env 对象中读取指定 key，空字符串视为未设置 */
function readEnvFromRecord(env: Record<string, string>, key: string): string {
  return env[key] ?? "";
}

/** 设置 env 对象中的指定 key，空字符串则删除该 key */
function setEnvInRecord(
  env: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  const next = { ...env };
  const trimmed = value.trim();
  if (trimmed) {
    next[key] = trimmed;
  } else {
    delete next[key];
  }
  return next;
}

/** 已知的连接/模型映射 env key（在专用字段中编辑，不出现在"附加环境变量"中） */
const KNOWN_CONNECTION_ENV_KEYS = new Set([
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_SUBAGENT_MODEL",
  "CLAUDE_CODE_EFFORT_LEVEL",
]);

const ProviderEditor = forwardRef<ProviderEditorHandle, ProviderEditorProps>(
  function ProviderEditor({ provider, onSave, onClose }, ref) {
    const { t } = useI18n();
    const form = useForm();
    const initialDraftRef = useRef<{
      nameZh: string;
      nameEn: string;
      env: Record<string, string>;
      saveData: ProviderEditorSaveData | null;
    } | null>(null);
    if (initialDraftRef.current === null) {
      const initialLocalizedName = resolveProviderLocalizedName(provider);
      const initialEnv = provider?.env ?? {};
      initialDraftRef.current = {
        nameZh: initialLocalizedName.zh,
        nameEn: initialLocalizedName.en,
        env: initialEnv,
        saveData: buildProviderSaveData(
          provider,
          initialLocalizedName.zh,
          initialLocalizedName.en,
          provider?.description ?? "",
          provider?.docUrl ?? "",
          provider?.modelSuggestions.join(", ") ?? "",
          initialEnv,
        ),
      };
    }
    const [nameZh, setNameZh] = useState(initialDraftRef.current.nameZh);
    const [nameEn, setNameEn] = useState(initialDraftRef.current.nameEn);
    const [description, setDescription] = useState(provider?.description ?? "");
    const [docUrl, setDocUrl] = useState(provider?.docUrl ?? "");
    const [modelSuggestions, setModelSuggestions] = useState(
      provider?.modelSuggestions.join(", ") ?? "",
    );
    const [env, setEnv] = useState<Record<string, string>>(
      () => initialDraftRef.current?.env ?? {},
    );

    // 保存进行中闸门：用 useRef(同步)杜绝单次保存窗口内 onSave 被重复触发
    const savingRef = useRef(false);

    const currentSaveData = buildProviderSaveData(
      provider,
      nameZh,
      nameEn,
      description,
      docUrl,
      modelSuggestions,
      env,
    );
    const canSavePreset = !!currentSaveData;
    const isDirty = !providerSaveDataEquals(initialDraftRef.current.saveData, currentSaveData);

    async function handleSaveClick() {
      if (!canSavePreset || !currentSaveData || savingRef.current) {
        return false;
      }
      savingRef.current = true;
      try {
        return await onSave(currentSaveData);
      } finally {
        savingRef.current = false;
      }
    }

    useImperativeHandle(ref, () => ({
      isDirty: () => isDirty,
      canSave: () => canSavePreset,
      save: handleSaveClick,
    }));

    return (
      <Form {...form}>
        <div
          data-slot="preset-editor-panel"
          className="flex h-full min-h-0 w-full min-w-[560px] flex-col overflow-hidden bg-secondary"
        >
          <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/95 px-5 shadow-toolbar">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t("common.close")}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Button>
            <h2 className={cn("min-w-0 flex-1 truncate", TYPOGRAPHY.drawerTitle)}>
              {provider ? t("providers.editor.title.edit") : t("providers.editor.title.add")}
            </h2>
            <Button
              type="button"
              disabled={!canSavePreset}
              onClick={() => {
                void handleSaveClick();
              }}
            >
              {t("providers.editor.save")}
            </Button>
          </div>

          <div
            data-slot="preset-editor-body"
            className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto bg-secondary px-6 py-6 pb-6 [&>*]:shrink-0 [&>:not([data-slot=profile-name-badge])]:w-[min(100%,880px)]"
          >
            {/* 基础信息 */}
            <EditorSection title={t("providers.editor.sections.metadata")}>
              <EditorFieldGrid>
                <EditorField>
                  <Label htmlFor="preset-name-zh" className="inline-flex items-center gap-2">
                    <span>{t("providers.editor.fields.nameZh")}</span>
                    <RequiredBadge text={t("form.oneRequired")} />
                  </Label>
                  <Input
                    id="preset-name-zh"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={nameZh}
                    onChange={(event) => setNameZh(event.target.value)}
                    placeholder={t("providers.editor.placeholders.nameZh")}
                  />
                </EditorField>
                <EditorField>
                  <Label htmlFor="preset-name-en" className="inline-flex items-center gap-2">
                    <span>{t("providers.editor.fields.nameEn")}</span>
                    <RequiredBadge text={t("form.oneRequired")} />
                  </Label>
                  <Input
                    id="preset-name-en"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={nameEn}
                    onChange={(event) => setNameEn(event.target.value)}
                    placeholder={t("providers.editor.placeholders.nameEn")}
                  />
                </EditorField>
              </EditorFieldGrid>

              <EditorFieldGrid className="md:grid-cols-1">
                <EditorField>
                  <Label htmlFor="preset-doc-url">{t("providers.editor.fields.docUrl")}</Label>
                  <Input
                    id="preset-doc-url"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={docUrl}
                    onChange={(event) => setDocUrl(event.target.value)}
                    placeholder="https://..."
                  />
                </EditorField>
              </EditorFieldGrid>

              <EditorFieldGrid className="md:grid-cols-1">
                <EditorField>
                  <Label htmlFor="preset-description">
                    {t("providers.editor.fields.description")}
                  </Label>
                  <Input
                    id="preset-description"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t("providers.editor.placeholders.description")}
                  />
                </EditorField>
              </EditorFieldGrid>

              <EditorField>
                <Label htmlFor="preset-model-suggestions">
                  {t("providers.editor.fields.modelSuggestions")}
                </Label>
                <Input
                  id="preset-model-suggestions"
                  className={EDITOR_CONTROL_SURFACE_CLASS}
                  value={modelSuggestions}
                  onChange={(event) => setModelSuggestions(event.target.value)}
                  placeholder={t("providers.editor.placeholders.modelSuggestions")}
                />
                <EditorDescription>
                  {t("providers.editor.hints.modelSuggestions")}
                </EditorDescription>
              </EditorField>
            </EditorSection>

            {/* 连接配置：只含 API 地址，认证密钥属于 Profile */}
            <EditorSection title={t("providers.editor.sections.auth")}>
              <EditorField>
                <EditorLabelRow>
                  <Label htmlFor="preset-base-url">{t("providers.editor.fields.baseUrl")}</Label>
                  <EditorEnvHint>{t("providers.editor.fields.baseUrlEnv")}</EditorEnvHint>
                </EditorLabelRow>
                <Input
                  id="preset-base-url"
                  aria-label={t("providers.editor.fields.baseUrlEnv")}
                  className={EDITOR_CONTROL_SURFACE_CLASS}
                  value={readEnvFromRecord(env, "ANTHROPIC_BASE_URL")}
                  placeholder="https://api.anthropic.com"
                  onChange={(event) =>
                    setEnv(setEnvInRecord(env, "ANTHROPIC_BASE_URL", event.target.value))
                  }
                />
              </EditorField>
            </EditorSection>

            {/* 模型映射：各类别默认模型（标签直接用中文，对应 env key 在 EditorEnvHint 展示） */}
            <EditorSection title={t("providers.editor.sections.behavior")}>
              <EditorFieldGrid>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="preset-model">默认模型</Label>
                    <EditorEnvHint>ANTHROPIC_MODEL</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="preset-model"
                    aria-label="ANTHROPIC_MODEL"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={readEnvFromRecord(env, "ANTHROPIC_MODEL")}
                    placeholder=""
                    onChange={(event) =>
                      setEnv(setEnvInRecord(env, "ANTHROPIC_MODEL", event.target.value))
                    }
                  />
                </EditorField>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="preset-opus-model">Opus 默认模型</Label>
                    <EditorEnvHint>ANTHROPIC_DEFAULT_OPUS_MODEL</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="preset-opus-model"
                    aria-label="ANTHROPIC_DEFAULT_OPUS_MODEL"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={readEnvFromRecord(env, "ANTHROPIC_DEFAULT_OPUS_MODEL")}
                    placeholder=""
                    onChange={(event) =>
                      setEnv(
                        setEnvInRecord(env, "ANTHROPIC_DEFAULT_OPUS_MODEL", event.target.value),
                      )
                    }
                  />
                </EditorField>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="preset-sonnet-model">Sonnet 默认模型</Label>
                    <EditorEnvHint>ANTHROPIC_DEFAULT_SONNET_MODEL</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="preset-sonnet-model"
                    aria-label="ANTHROPIC_DEFAULT_SONNET_MODEL"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={readEnvFromRecord(env, "ANTHROPIC_DEFAULT_SONNET_MODEL")}
                    placeholder=""
                    onChange={(event) =>
                      setEnv(
                        setEnvInRecord(env, "ANTHROPIC_DEFAULT_SONNET_MODEL", event.target.value),
                      )
                    }
                  />
                </EditorField>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="preset-haiku-model">Haiku 默认模型</Label>
                    <EditorEnvHint>ANTHROPIC_DEFAULT_HAIKU_MODEL</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="preset-haiku-model"
                    aria-label="ANTHROPIC_DEFAULT_HAIKU_MODEL"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={readEnvFromRecord(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL")}
                    placeholder=""
                    onChange={(event) =>
                      setEnv(
                        setEnvInRecord(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL", event.target.value),
                      )
                    }
                  />
                </EditorField>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="preset-subagent-model">Subagent 模型</Label>
                    <EditorEnvHint>CLAUDE_CODE_SUBAGENT_MODEL</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="preset-subagent-model"
                    aria-label="CLAUDE_CODE_SUBAGENT_MODEL"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={readEnvFromRecord(env, "CLAUDE_CODE_SUBAGENT_MODEL")}
                    placeholder=""
                    onChange={(event) =>
                      setEnv(setEnvInRecord(env, "CLAUDE_CODE_SUBAGENT_MODEL", event.target.value))
                    }
                  />
                </EditorField>
                <EditorField>
                  <EditorLabelRow>
                    <Label htmlFor="preset-effort-level">努力级别</Label>
                    <EditorEnvHint>CLAUDE_CODE_EFFORT_LEVEL</EditorEnvHint>
                  </EditorLabelRow>
                  <Input
                    id="preset-effort-level"
                    aria-label="CLAUDE_CODE_EFFORT_LEVEL"
                    className={EDITOR_CONTROL_SURFACE_CLASS}
                    value={readEnvFromRecord(env, "CLAUDE_CODE_EFFORT_LEVEL")}
                    placeholder="auto / low / medium / high / max"
                    onChange={(event) =>
                      setEnv(setEnvInRecord(env, "CLAUDE_CODE_EFFORT_LEVEL", event.target.value))
                    }
                  />
                </EditorField>
              </EditorFieldGrid>
            </EditorSection>

            {/* 附加环境变量：编辑 env 中其余键 */}
            <ProviderExtraEnvEditor
              env={env}
              knownKeys={KNOWN_CONNECTION_ENV_KEYS}
              onChange={setEnv}
              sectionTitle={t("providers.editor.sections.environment")}
            />
          </div>
        </div>
      </Form>
    );
  },
);

export default ProviderEditor;

/** 附加环境变量编辑器（键值列表，不含已有专用字段的 key） */
function ProviderExtraEnvEditor({
  env,
  knownKeys,
  onChange,
  sectionTitle,
}: {
  env: Record<string, string>;
  knownKeys: Set<string>;
  onChange: (next: Record<string, string>) => void;
  sectionTitle: string;
}) {
  // 从 env 中过滤出"附加"键（未被专用字段覆盖的）
  const extraEntries = useMemo(
    () => Object.entries(env).filter(([key]) => !knownKeys.has(key)),
    [env, knownKeys],
  );

  function handleKeyChange(oldKey: string, newKey: string) {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (k === oldKey) {
        const trimmedNew = newKey.trim();
        if (trimmedNew) {
          next[trimmedNew] = v;
        }
      } else {
        next[k] = v;
      }
    }
    onChange(next);
  }

  function handleValueChange(key: string, value: string) {
    const next = { ...env };
    if (value.trim()) {
      next[key] = value;
    } else {
      delete next[key];
    }
    onChange(next);
  }

  function handleAddEntry() {
    // 找一个不冲突的占位 key
    let index = 1;
    let newKey = `ENV_VAR_${index}`;
    while (env[newKey] !== undefined) {
      index += 1;
      newKey = `ENV_VAR_${index}`;
    }
    onChange({ ...env, [newKey]: "" });
  }

  function handleRemoveEntry(key: string) {
    const next = { ...env };
    delete next[key];
    onChange(next);
  }

  return (
    <EditorSection title={sectionTitle}>
      {extraEntries.length > 0 && (
        <div className="flex flex-col gap-2">
          {extraEntries.map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <Input
                className={cn(EDITOR_CONTROL_SURFACE_CLASS, "font-mono")}
                aria-label="环境变量名称"
                value={key}
                placeholder="ENV_KEY"
                onChange={(event) => handleKeyChange(key, event.target.value)}
              />
              <Input
                className={EDITOR_CONTROL_SURFACE_CLASS}
                aria-label="环境变量值"
                value={value}
                placeholder=""
                onChange={(event) => handleValueChange(key, event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="删除"
                onClick={() => handleRemoveEntry(key)}
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={handleAddEntry}
      >
        + 新增环境变量
      </Button>
    </EditorSection>
  );
}
