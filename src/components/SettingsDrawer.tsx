import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { platform } from "@tauri-apps/plugin-os";
import {
  ChevronLeft,
  Code2,
  FileText,
  Info,
  type LucideIcon,
  Monitor,
  Moon,
  Sun,
  Terminal as TerminalIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import { useToast } from "../hooks/useToast";
import { type Language, type TranslationKey, useI18n } from "../i18n";
import { ipc } from "../ipc";
import { cn } from "../lib/utils";
import type {
  AppPreferences,
  DefaultEditorApp,
  DefaultTerminalApp,
  NativeOpenAppOptions,
  NativeOpenPlatform,
  SessionTrayCountStyle,
} from "../types";
import LogViewer from "./LogViewer";
import SystemInfoDialog from "./SystemInfoDialog";
import {
  DEFAULT_FOCUS_SESSION_SHORTCUT,
  formatAccelerator,
  keyEventToAccelerator,
} from "./shortcut-utils";
import { type Theme, useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel, FieldTitle } from "./ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "./ui/popover";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";

interface SettingsDrawerProps {
  onClose: () => void;
}

interface SettingsSectionCardProps {
  title: string;
  description: string;
  headerAction?: ReactNode;
  children: ReactNode;
}

interface NativeOpenSelectOption<T extends string> {
  value: T;
  label: string;
}

const EDITOR_UNSET_VALUE = "__unset";
// Slider 最大值代表"全展示"（无字数限制），对应后端 trayTitleMaxChars = null
const TRAY_TITLE_SLIDER_MAX = 8;

const languageOptions: {
  value: Language;
  labelKey: TranslationKey;
}[] = [
  { value: "zh", labelKey: "settings.languageChinese" },
  { value: "en", labelKey: "settings.languageEnglish" },
];

const sessionTrayCountStyleOptions: {
  value: SessionTrayCountStyle;
  labelKey: TranslationKey;
}[] = [
  { value: "superscriptCompact", labelKey: "settings.sessionTrayCountStyleSuperscriptCompact" },
  { value: "superscript", labelKey: "settings.sessionTrayCountStyleSuperscript" },
  { value: "plain", labelKey: "settings.sessionTrayCountStylePlain" },
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

const terminalOptions: NativeOpenSelectOption<DefaultTerminalApp>[] = [
  { value: "terminal", label: "Terminal" },
  { value: "iterm", label: "iTerm" },
  { value: "warp", label: "Warp" },
  { value: "ghostty", label: "Ghostty" },
];

const editorOptions: NativeOpenSelectOption<DefaultEditorApp>[] = [
  { value: "vscode", label: "VS Code" },
  { value: "cursor", label: "Cursor" },
  { value: "windsurf", label: "Windsurf" },
  { value: "zed", label: "Zed" },
];

function normalizePlatformName(platformName: string): NativeOpenPlatform {
  if (platformName === "macos" || platformName === "linux" || platformName === "windows") {
    return platformName;
  }
  return "other";
}

function getCurrentPlatform(): NativeOpenPlatform {
  try {
    return normalizePlatformName(platform());
  } catch {
    return "macos";
  }
}

function getTerminalOptionsForPlatform(platformName: NativeOpenPlatform) {
  if (platformName === "macos") {
    return terminalOptions;
  }
  if (platformName === "linux") {
    return terminalOptions.filter((option) => option.value !== "iterm");
  }
  if (platformName === "windows") {
    return terminalOptions.filter(
      (option) => option.value === "terminal" || option.value === "warp",
    );
  }
  return [];
}

function mergeAvailableOptions<T extends string>(
  options: NativeOpenSelectOption<T>[],
  availableOptions: { slug: T }[] | undefined,
  currentValue: T | null | undefined,
  fallbackOptions: NativeOpenSelectOption<T>[] = options,
) {
  if (!availableOptions) {
    return options;
  }

  const availableSlugs = new Set(availableOptions.map((option) => option.slug));
  const visibleOptions = options.filter((option) => availableSlugs.has(option.value));
  if (currentValue && !visibleOptions.some((option) => option.value === currentValue)) {
    const currentOption = fallbackOptions.find((option) => option.value === currentValue);
    if (currentOption) {
      visibleOptions.push(currentOption);
    }
  }
  return visibleOptions;
}

function toSelectOptions<T extends string>(
  options: { slug: T; label: string }[],
): NativeOpenSelectOption<T>[] {
  return options.map((option) => ({
    value: option.slug,
    label: option.label,
  }));
}

function getNativeOpenOptionLabel(
  option: NativeOpenSelectOption<DefaultEditorApp | DefaultTerminalApp>,
  kind: "editor" | "terminal",
  t: (key: TranslationKey) => string,
) {
  if (kind === "terminal" && option.value === "terminal") {
    return t("settings.systemDefaultTerminal");
  }
  return option.label;
}

function getPlatformDisplayName(
  platformName: NativeOpenPlatform,
  t: (key: TranslationKey) => string,
) {
  switch (platformName) {
    case "macos":
      return t("settings.platformMacos");
    case "linux":
      return t("settings.platformLinux");
    case "windows":
      return t("settings.platformWindows");
    case "other":
      return t("settings.platformOther");
  }
}

function SettingsSectionCard({
  title,
  description,
  headerAction,
  children,
}: SettingsSectionCardProps) {
  return (
    <Card className="gap-4 rounded-lg py-0 shadow-xs">
      <CardHeader className="gap-1 px-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm leading-5">{title}</CardTitle>
            <CardDescription className="leading-5">{description}</CardDescription>
          </div>
          {headerAction}
        </div>
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

// 会话聚焦快捷键设置项：开关启用/禁用 + 录制快捷键组合(仅 macOS 展示)。
function FocusSessionShortcutField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { t } = useI18n();
  const [recording, setRecording] = useState(false);
  const enabled = value !== null;

  useEffect(() => {
    if (!recording) {
      return;
    }
    // 录制期间捕获全局按键,转成 Tauri accelerator;Esc 取消,只按修饰键不结束
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      const accelerator = keyEventToAccelerator(event);
      if (accelerator) {
        onChange(accelerator);
        setRecording(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [recording, onChange]);

  return (
    <Field className="gap-2">
      <div className="flex items-center justify-between gap-2">
        <FieldTitle className="text-muted-foreground text-xs">
          {t("settings.focusSessionShortcut")}
        </FieldTitle>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => {
            setRecording(false);
            onChange(checked ? DEFAULT_FOCUS_SESSION_SHORTCUT : null);
          }}
          aria-label={t("settings.focusSessionShortcut")}
        />
      </div>
      {enabled && (
        <>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-mono"
              onClick={() => setRecording((prev) => !prev)}
            >
              {recording
                ? t("settings.focusSessionShortcutRecording")
                : value
                  ? formatAccelerator(value)
                  : t("settings.focusSessionShortcutRecord")}
            </Button>
            {value !== DEFAULT_FOCUS_SESSION_SHORTCUT && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRecording(false);
                  onChange(DEFAULT_FOCUS_SESSION_SHORTCUT);
                }}
              >
                {t("settings.focusSessionShortcutReset")}
              </Button>
            )}
          </div>
          <span className="text-muted-foreground text-xs">
            {t("settings.focusSessionShortcutHint")}
          </span>
        </>
      )}
    </Field>
  );
}

function NativeOpenOptionContent({ kind, label }: { kind: "editor" | "terminal"; label: string }) {
  const Icon = kind === "editor" ? Code2 : TerminalIcon;
  return (
    <span className="flex min-w-0 items-center gap-3 py-0.5">
      <span
        data-slot="native-open-option-icon"
        className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground shadow-xs"
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function NativeOpenHelpButton({
  ariaLabel,
  title,
  kind,
  platformName,
  supportedOptions,
  detectedOptions,
}: {
  ariaLabel: string;
  title: string;
  kind: "editor" | "terminal";
  platformName: NativeOpenPlatform;
  supportedOptions: NativeOpenSelectOption<DefaultEditorApp | DefaultTerminalApp>[];
  detectedOptions: NativeOpenSelectOption<DefaultEditorApp | DefaultTerminalApp>[];
}) {
  const { t } = useI18n();
  const detectedSlugs = new Set(detectedOptions.map((option) => option.value));
  const hasSupportedOptions = supportedOptions.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-7 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={ariaLabel}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>
            {kind === "terminal"
              ? t("settings.nativeOpenTerminalHelpDesc")
              : t("settings.nativeOpenEditorHelpDesc")}
          </PopoverDescription>
        </PopoverHeader>
        <div className="mt-3 flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-muted-foreground">{t("settings.nativeOpenCurrentPlatform")}</span>
            <span className="font-medium">{getPlatformDisplayName(platformName, t)}</span>
          </div>
          {hasSupportedOptions ? (
            <ul className="flex flex-col gap-2">
              {supportedOptions.map((option) => {
                const detected = detectedSlugs.has(option.value);
                const label = getNativeOpenOptionLabel(option, kind, t);
                return (
                  <li
                    key={option.value}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  >
                    <span className="min-w-0 truncate">{label}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-2 py-0.5 text-xs",
                        detected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {detected
                        ? t("settings.nativeOpenDetected")
                        : t("settings.nativeOpenNotDetected")}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-muted-foreground">
              {t("settings.nativeOpenUnsupportedPlatform")}
            </p>
          )}
          {detectedOptions.length === 0 ? (
            <p className="text-muted-foreground">{t("settings.nativeOpenNoDetectedHelp")}</p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SystemNotificationsHelpButton() {
  const { t } = useI18n();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-7 rounded-full text-muted-foreground hover:text-foreground"
          aria-label={t("settings.systemNotificationsHelp")}
        >
          <Info className="size-3.5" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{t("settings.systemNotificationsHelpTitle")}</PopoverTitle>
          <PopoverDescription>{t("settings.systemNotificationsHelpDesc")}</PopoverDescription>
        </PopoverHeader>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
          <li>{t("settings.systemNotificationsTriggerPendingSession")}</li>
          <li>{t("settings.systemNotificationsTriggerFocusFailure")}</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function SettingsDrawer({ onClose }: SettingsDrawerProps) {
  const { t, language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const { showToast } = useToast();
  const [preferences, setPreferences] = useState<AppPreferences>({
    showTrayTitle: true,
    showTraySessions: true,
    systemNotificationsEnabled: false,
    collapseSidebarByDefault: false,
    thirdPartyProviderPricingEnabled: true,
    uiLanguage: "zh",
    defaultTerminalApp: "terminal",
    defaultEditorApp: null,
    trayTitleMaxChars: null,
    sessionTrayCountStyle: "superscriptCompact",
    trayPulseWaiting: true,
    focusSessionShortcut: DEFAULT_FOCUS_SESSION_SHORTCUT,
  });
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isSystemInfoOpen, setIsSystemInfoOpen] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [nativeOpenOptions, setNativeOpenOptions] = useState<NativeOpenAppOptions | null>(null);

  useEffect(() => {
    ipc
      .getConfigWorkspace()
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

  useEffect(() => {
    let cancelled = false;
    ipc
      .getNativeOpenAppOptions()
      .then((options) => {
        if (!cancelled) {
          setNativeOpenOptions(options);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNativeOpenOptions(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showTrayTitle = preferences.showTrayTitle;
  const trayTitleMaxChars = preferences.trayTitleMaxChars;
  // Slider 位置：未开启时为 0，有字数限制时取限制值，无限制时取最大值
  const trayTitleSliderValue = showTrayTitle ? (trayTitleMaxChars ?? TRAY_TITLE_SLIDER_MAX) : 0;
  const showTraySessions = preferences.showTraySessions;
  const sessionTrayCountStyle = preferences.sessionTrayCountStyle;
  const trayPulseWaiting = preferences.trayPulseWaiting;
  const focusSessionShortcut = preferences.focusSessionShortcut;
  const systemNotificationsEnabled = preferences.systemNotificationsEnabled;
  const collapseSidebarByDefault = preferences.collapseSidebarByDefault;
  const thirdPartyProviderPricingEnabled = preferences.thirdPartyProviderPricingEnabled;
  const defaultTerminalApp = preferences.defaultTerminalApp;
  const defaultEditorApp = preferences.defaultEditorApp;
  const platformName = nativeOpenOptions?.platform ?? getCurrentPlatform();
  const supportedTerminalOptions = nativeOpenOptions?.supportedTerminals
    ? toSelectOptions(nativeOpenOptions.supportedTerminals)
    : getTerminalOptionsForPlatform(platformName);
  const supportedEditorOptions = nativeOpenOptions?.supportedEditors
    ? toSelectOptions(nativeOpenOptions.supportedEditors)
    : editorOptions;
  const detectedTerminalOptions = nativeOpenOptions?.terminals
    ? toSelectOptions(nativeOpenOptions.terminals)
    : supportedTerminalOptions;
  const detectedEditorOptions = nativeOpenOptions?.editors
    ? toSelectOptions(nativeOpenOptions.editors)
    : supportedEditorOptions;
  const visibleTerminalOptions = mergeAvailableOptions(
    supportedTerminalOptions,
    nativeOpenOptions?.terminals,
    defaultTerminalApp,
    terminalOptions,
  );
  const visibleEditorOptions = mergeAvailableOptions(
    supportedEditorOptions,
    nativeOpenOptions?.editors,
    defaultEditorApp,
    editorOptions,
  );
  const hasDetectedTerminalOptions =
    !nativeOpenOptions?.terminals || nativeOpenOptions.terminals.length > 0;
  const hasDetectedEditorOptions =
    !nativeOpenOptions?.editors || nativeOpenOptions.editors.length > 0;
  const isCurrentTerminalUnavailable =
    Boolean(nativeOpenOptions?.terminals) &&
    !nativeOpenOptions?.terminals?.some((option) => option.slug === defaultTerminalApp);
  const isCurrentEditorUnavailable =
    Boolean(nativeOpenOptions?.editors) &&
    Boolean(defaultEditorApp) &&
    !nativeOpenOptions?.editors?.some((option) => option.slug === defaultEditorApp);

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
      await ipc.setAppPreferences(next);
    } catch (err) {
      setPreferences(rollback);
      if (rollback.uiLanguage !== language) {
        setLanguage(rollback.uiLanguage as Language);
      }
      showOperationError(showToast, t("toast.configSaveError"), err);
    }
  }

  async function ensureSystemNotificationPermission() {
    try {
      if (await isPermissionGranted()) {
        return true;
      }
      return (await requestPermission()) === "granted";
    } catch (err) {
      showOperationError(showToast, t("toast.systemNotificationsPermissionError"), err);
      return false;
    }
  }

  async function toggleSystemNotifications(checked: boolean) {
    const rollback = nextPreferences;
    const next = {
      ...nextPreferences,
      systemNotificationsEnabled: checked,
    };
    if (!checked) {
      await persistPreferences(next, rollback);
      return;
    }

    const granted = await ensureSystemNotificationPermission();
    if (!granted) {
      showToast(t("toast.systemNotificationsPermissionDenied"), "error");
      return;
    }

    await persistPreferences(next, rollback);
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
          <SheetTitle className="text-base">{t("settings.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("settings.description")}</SheetDescription>
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
              title={t("settings.collapseSidebarByDefault")}
              description={t("settings.collapseSidebarByDefaultDesc")}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent>
                    <SettingsStateLabel enabled={collapseSidebarByDefault} />
                  </FieldContent>
                  <Switch
                    id="settings-collapse-sidebar-by-default"
                    checked={collapseSidebarByDefault}
                    onCheckedChange={(checked) => {
                      void persistPreferences(
                        {
                          ...nextPreferences,
                          collapseSidebarByDefault: checked,
                        },
                        nextPreferences,
                      );
                    }}
                    aria-label={t("settings.collapseSidebarByDefault")}
                  />
                </Field>
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
                <Field className="gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <FieldTitle className="text-muted-foreground text-xs">
                      {t("settings.trayTitleCharLimit")}
                    </FieldTitle>
                    <span className="text-muted-foreground text-xs">
                      {trayTitleSliderValue === 0
                        ? t("settings.trayTitleCharLimitOff")
                        : trayTitleSliderValue >= TRAY_TITLE_SLIDER_MAX
                          ? t("settings.trayTitleCharLimitUnlimited")
                          : t("settings.trayTitleCharLimitValue").replace(
                              "{count}",
                              String(trayTitleSliderValue),
                            )}
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={TRAY_TITLE_SLIDER_MAX}
                    step={1}
                    value={[trayTitleSliderValue]}
                    onValueChange={([value]) => {
                      // 0 档关闭托盘标题；MAX 档为全展示（null）；中间档限制为该字数
                      const patch =
                        value === 0
                          ? { showTrayTitle: false }
                          : {
                              showTrayTitle: true,
                              trayTitleMaxChars: value >= TRAY_TITLE_SLIDER_MAX ? null : value,
                            };
                      void persistPreferences({ ...nextPreferences, ...patch }, nextPreferences);
                    }}
                    aria-label={t("settings.trayTitleCharLimit")}
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
                <Field className="gap-2">
                  <FieldTitle className="text-muted-foreground text-xs">
                    {t("settings.sessionTrayCountStyle")}
                  </FieldTitle>
                  <Select
                    value={sessionTrayCountStyle}
                    onValueChange={(value) => {
                      void persistPreferences(
                        {
                          ...nextPreferences,
                          sessionTrayCountStyle: value as SessionTrayCountStyle,
                        },
                        nextPreferences,
                      );
                    }}
                  >
                    <SelectTrigger
                      id="settings-session-tray-count-style"
                      aria-label={t("settings.sessionTrayCountStyle")}
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sessionTrayCountStyleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {platformName === "macos" && (
                  <>
                    <Field orientation="horizontal" className="items-center justify-between gap-4">
                      <FieldTitle className="text-muted-foreground text-xs">
                        {t("settings.trayPulseWaiting")}
                      </FieldTitle>
                      <Switch
                        id="settings-tray-pulse-waiting"
                        checked={trayPulseWaiting}
                        onCheckedChange={(checked) => {
                          void persistPreferences(
                            { ...nextPreferences, trayPulseWaiting: checked },
                            nextPreferences,
                          );
                        }}
                        aria-label={t("settings.trayPulseWaiting")}
                      />
                    </Field>
                    <FocusSessionShortcutField
                      value={focusSessionShortcut}
                      onChange={(next) => {
                        void persistPreferences(
                          { ...nextPreferences, focusSessionShortcut: next },
                          nextPreferences,
                        );
                      }}
                    />
                  </>
                )}
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.systemNotifications")}
              description={t("settings.systemNotificationsDesc")}
              headerAction={<SystemNotificationsHelpButton />}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent>
                    <SettingsStateLabel enabled={systemNotificationsEnabled} />
                  </FieldContent>
                  <Switch
                    id="settings-system-notifications"
                    checked={systemNotificationsEnabled}
                    onCheckedChange={(checked) => {
                      void toggleSystemNotifications(checked);
                    }}
                    aria-label={t("settings.systemNotifications")}
                  />
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.thirdPartyProviderPricing")}
              description={t("settings.thirdPartyProviderPricingDesc")}
            >
              <FieldGroup className="gap-4">
                <Field orientation="horizontal" className="items-center justify-between gap-4">
                  <FieldContent>
                    <SettingsStateLabel enabled={thirdPartyProviderPricingEnabled} />
                  </FieldContent>
                  <Switch
                    id="settings-third-party-provider-pricing"
                    checked={thirdPartyProviderPricingEnabled}
                    onCheckedChange={(checked) => {
                      void persistPreferences(
                        {
                          ...nextPreferences,
                          thirdPartyProviderPricingEnabled: checked,
                        },
                        nextPreferences,
                      );
                    }}
                    aria-label={t("settings.thirdPartyProviderPricing")}
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
              headerAction={
                <NativeOpenHelpButton
                  ariaLabel={t("settings.defaultTerminalHelp")}
                  title={t("settings.defaultTerminal")}
                  kind="terminal"
                  platformName={platformName}
                  supportedOptions={supportedTerminalOptions}
                  detectedOptions={detectedTerminalOptions}
                />
              }
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
                    <SelectContent className="min-w-60 rounded-xl">
                      <SelectGroup>
                        {visibleTerminalOptions.map((option) => {
                          const label = getNativeOpenOptionLabel(option, "terminal", t);
                          return (
                            <SelectItem key={option.value} value={option.value} textValue={label}>
                              <NativeOpenOptionContent kind="terminal" label={label} />
                            </SelectItem>
                          );
                        })}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {!hasDetectedTerminalOptions ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.noDetectedTerminal")}
                    </p>
                  ) : null}
                  {isCurrentTerminalUnavailable ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.currentNativeOpenUnavailable")}
                    </p>
                  ) : null}
                </Field>
              </FieldGroup>
            </SettingsSectionCard>

            <SettingsSectionCard
              title={t("settings.defaultEditor")}
              description={t("settings.defaultEditorDesc")}
              headerAction={
                <NativeOpenHelpButton
                  ariaLabel={t("settings.defaultEditorHelp")}
                  title={t("settings.defaultEditor")}
                  kind="editor"
                  platformName={platformName}
                  supportedOptions={supportedEditorOptions}
                  detectedOptions={detectedEditorOptions}
                />
              }
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
                    <SelectContent className="min-w-60 rounded-xl">
                      <SelectGroup>
                        <SelectItem value={EDITOR_UNSET_VALUE}>
                          {t("settings.editorUnset")}
                        </SelectItem>
                        {visibleEditorOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            textValue={option.label}
                          >
                            <NativeOpenOptionContent kind="editor" label={option.label} />
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {!hasDetectedEditorOptions ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.noDetectedEditor")}
                    </p>
                  ) : null}
                  {isCurrentEditorUnavailable ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.currentNativeOpenUnavailable")}
                    </p>
                  ) : null}
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
