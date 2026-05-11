import { invoke } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { ChevronLeft, FileText, Info, type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import { cn } from "../lib/utils";
import type {
  AppPreferences,
  ConfigWorkspace,
  DefaultEditorApp,
  DefaultTerminalApp,
} from "../types";
import LogViewer from "./LogViewer";
import SystemInfoDialog from "./SystemInfoDialog";
import { type Theme, useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "./ui/field";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Switch } from "./ui/switch";

interface SettingsDrawerProps {
  onClose: () => void;
}

interface SettingsSectionCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

const EDITOR_UNSET_VALUE = "__unset";

const languageOptions: {
  value: Language;
  labelKey: TranslationKey;
}[] = [
  { value: "zh", labelKey: "settings.languageChinese" },
  { value: "en", labelKey: "settings.languageEnglish" },
];

const themeOptions: {
  value: Theme;
  labelKey: "settings.themeLight" | "settings.themeDark" | "settings.themeSystem";
  Icon: LucideIcon;
}[] = [
  { value: "system", labelKey: "settings.themeSystem", Icon: Monitor },
  { value: "light", labelKey: "settings.themeLight", Icon: Sun },
  { value: "dark", labelKey: "settings.themeDark", Icon: Moon },
];

const terminalOptions: { value: DefaultTerminalApp; label: string }[] = [
  { value: "terminal", label: "Terminal" },
  { value: "iterm", label: "iTerm" },
  { value: "warp", label: "Warp" },
  { value: "ghostty", label: "Ghostty" },
];

const editorOptions: { value: DefaultEditorApp; label: string }[] = [
  { value: "vscode", label: "VS Code" },
  { value: "cursor", label: "Cursor" },
  { value: "windsurf", label: "Windsurf" },
  { value: "zed", label: "Zed" },
];

function SettingsSectionCard({ title, description, children }: SettingsSectionCardProps) {
  return (
    <Card className="gap-4 rounded-lg py-0 shadow-xs">
      <CardHeader className="gap-1 px-4 pt-4">
        <CardTitle className="text-sm leading-5">{title}</CardTitle>
        <CardDescription className="leading-5">{description}</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function SettingsStateLabel({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  return (
    <FieldTitle className={cn("text-muted-foreground", enabled && "text-foreground")}>
      {enabled ? t("settings.enabled") : t("settings.disabled")}
    </FieldTitle>
  );
}

function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<AppPreferences>({
    showTrayTitle: true,
    showTraySessions: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
  });
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isSystemInfoOpen, setIsSystemInfoOpen] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);

  useEffect(() => {
    invoke<ConfigWorkspace>("get_config_workspace")
      .then((workspace) => {
        setPreferences(workspace.app);
        if (workspace.app.uiLanguage !== language) {
          setLanguage(workspace.app.uiLanguage as Language);
        }
      })
      .catch((err) => {
        showOperationError(showToast, t("toast.configLoadError"), err);
      });
  }, [language, setLanguage, showToast, t]);

  // 自启动真实状态由系统持久化（LaunchAgent / 注册表 / .desktop），打开抽屉时主动同步
  useEffect(() => {
    isAutostartEnabled()
      .then(setLaunchAtLogin)
      .catch((err) => {
        showOperationError(showToast, t("toast.autostartQueryError"), err);
      });
  }, [showToast, t]);

  const showTrayTitle = preferences.showTrayTitle;
  const showTraySessions = preferences.showTraySessions;
  const defaultTerminalApp = preferences.defaultTerminalApp;
  const defaultEditorApp = preferences.defaultEditorApp;

  const nextPreferences = useMemo(
    () => ({
      ...preferences,
      uiLanguage: language,
    }),
    [language, preferences],
  );

  async function persistPreferences(next: AppPreferences, rollback: AppPreferences) {
    setPreferences(next);
    try {
      await invoke<AppPreferences>("set_app_preferences", { data: next });
    } catch (err) {
      setPreferences(rollback);
      if (rollback.uiLanguage !== language) {
        setLanguage(rollback.uiLanguage as Language);
      }
      showOperationError(showToast, t("toast.configSaveError"), err);
    }
  }

  // 乐观切换：失败时回滚 UI 并提示
  async function toggleLaunchAtLogin(next: boolean) {
    setLaunchAtLogin(next);
    try {
      if (next) {
        await enableAutostart();
      } else {
        await disableAutostart();
      }
    } catch (err) {
      setLaunchAtLogin(!next);
      showOperationError(showToast, t("toast.autostartSaveError"), err);
    }
  }

  function handleLanguageChange(nextLanguage: string) {
    const resolvedLanguage = nextLanguage as Language;
    const rollback = nextPreferences;
    setLanguage(resolvedLanguage);
    void persistPreferences(
      {
        ...nextPreferences,
        uiLanguage: resolvedLanguage,
      },
      rollback,
    );
  }

  function handleTerminalChange(nextTerminal: string) {
    void persistPreferences(
      {
        ...nextPreferences,
        defaultTerminalApp: nextTerminal as DefaultTerminalApp,
      },
      nextPreferences,
    );
  }

  function handleEditorChange(nextEditor: string) {
    void persistPreferences(
      {
        ...nextPreferences,
        defaultEditorApp:
          nextEditor === EDITOR_UNSET_VALUE ? null : (nextEditor as DefaultEditorApp),
      },
      nextPreferences,
    );
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-labelledby="settings-drawer-title"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="flex h-12 shrink-0 flex-row items-center gap-3 border-b px-4 py-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t("common.close")}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <SheetTitle id="settings-drawer-title" className="text-base">
            {t("settings.title")}
          </SheetTitle>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <div className="flex flex-col gap-4 p-4">
            <SettingsSectionCard
              title={t("settings.language")}
              description={t("settings.languageDesc")}
            >
              <FieldGroup className="gap-4">
                <Field>
                  <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger
                      id="settings-language-select"
                      aria-label={t("settings.language")}
                      className="w-full sm:w-60"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {languageOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard title={t("settings.theme")} description={t("settings.themeDesc")}>
              <FieldGroup className="gap-4">
                <RadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as Theme)}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                  aria-label={t("settings.theme")}
                >
                  {themeOptions.map(({ value, labelKey, Icon }) => {
                    const itemId = `settings-theme-${value}`;
                    const checked = theme === value;
                    return (
                      <Field
                        key={value}
                        orientation="horizontal"
                        className={cn(
                          "items-center rounded-md border bg-background p-3 transition-colors",
                          checked
                            ? "border-primary text-primary"
                            : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <RadioGroupItem value={value} id={itemId} />
                        <FieldLabel htmlFor={itemId} className="min-w-0 flex-1 cursor-pointer">
                          <Icon aria-hidden="true" />
                          <span>{t(labelKey)}</span>
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </RadioGroup>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.showTrayTitle")}
              description={t("settings.showTrayTitleDesc")}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent>
                    <SettingsStateLabel enabled={showTrayTitle} />
                  </FieldContent>
                  <Switch
                    id="settings-show-tray-title"
                    checked={showTrayTitle}
                    onCheckedChange={(checked) => {
                      void persistPreferences(
                        {
                          ...nextPreferences,
                          showTrayTitle: checked,
                        },
                        nextPreferences,
                      );
                    }}
                    aria-label={t("settings.showTrayTitle")}
                  />
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.showTraySessions")}
              description={t("settings.showTraySessionsDesc")}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent>
                    <SettingsStateLabel enabled={showTraySessions} />
                  </FieldContent>
                  <Switch
                    id="settings-show-tray-sessions"
                    checked={showTraySessions}
                    onCheckedChange={(checked) => {
                      void persistPreferences(
                        {
                          ...nextPreferences,
                          showTraySessions: checked,
                        },
                        nextPreferences,
                      );
                    }}
                    aria-label={t("settings.showTraySessions")}
                  />
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.launchAtLogin")}
              description={t("settings.launchAtLoginDesc")}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent>
                    <SettingsStateLabel enabled={launchAtLogin} />
                  </FieldContent>
                  <Switch
                    id="settings-launch-at-login"
                    checked={launchAtLogin}
                    onCheckedChange={(checked) => void toggleLaunchAtLogin(checked)}
                    aria-label={t("settings.launchAtLogin")}
                  />
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.defaultTerminal")}
              description={t("settings.defaultTerminalDesc")}
            >
              <FieldGroup className="gap-4">
                <Field>
                  <Select value={defaultTerminalApp} onValueChange={handleTerminalChange}>
                    <SelectTrigger
                      id="settings-terminal-select"
                      aria-label={t("settings.defaultTerminal")}
                      className="w-full sm:w-60"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {terminalOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.defaultEditor")}
              description={t("settings.defaultEditorDesc")}
            >
              <FieldGroup className="gap-4">
                <Field>
                  <Select
                    value={defaultEditorApp ?? EDITOR_UNSET_VALUE}
                    onValueChange={handleEditorChange}
                  >
                    <SelectTrigger
                      id="settings-editor-select"
                      aria-label={t("settings.defaultEditor")}
                      className="w-full sm:w-60"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value={EDITOR_UNSET_VALUE}>
                          {t("settings.editorUnset")}
                        </SelectItem>
                        {editorOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.diagnostics")}
              description={t("settings.diagnosticsDesc")}
            >
              <Button type="button" variant="outline" onClick={() => setIsLogViewerOpen(true)}>
                <FileText data-icon="inline-start" aria-hidden="true" />
                {t("settings.viewLogs")}
              </Button>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.systemInfo")}
              description={t("settings.systemInfoDesc")}
            >
              <Button type="button" variant="outline" onClick={() => setIsSystemInfoOpen(true)}>
                <Info data-icon="inline-start" aria-hidden="true" />
                {t("settings.viewSystemInfo")}
              </Button>
            </SettingsSectionCard>
          </div>
        </div>
        {isLogViewerOpen ? <LogViewer onClose={() => setIsLogViewerOpen(false)} /> : null}
        {isSystemInfoOpen ? <SystemInfoDialog onClose={() => setIsSystemInfoOpen(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

export default SettingsDrawer;
