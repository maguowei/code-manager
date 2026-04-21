import { useEffect, useMemo, useState } from "react";
import {
  createInitialSectionModes,
  LOW_FREQUENCY_SECTION_ORDER,
  type LowFrequencySectionKey,
  type PureSettingsSectionKey,
} from "./editor-shared-constants";
import type { SectionEditorMode } from "./SettingsSectionModePanel";

interface StructuredSettingsJsonErrors {
  env?: string;
  permissions?: string;
  sandbox?: string;
  hooks?: string;
  marketplaces?: string;
  plugins?: string;
}

export interface StructuredSettingsSectionState {
  sectionModes: Record<PureSettingsSectionKey, SectionEditorMode>;
  environmentExpanded: boolean;
  activeAccordionSection: LowFrequencySectionKey | null;
  editorErrors: Record<string, string>;
  hasEditorErrors: boolean;
  setSectionError: (section: string, message: string) => void;
  handleSectionModeChange: (section: PureSettingsSectionKey, mode: SectionEditorMode) => void;
  toggleAccordionSection: (section: LowFrequencySectionKey) => void;
  toggleEnvironmentExpanded: () => void;
}

function useStructuredSettingsSectionState(
  jsonErrors: StructuredSettingsJsonErrors,
): StructuredSettingsSectionState {
  const [sectionModes, setSectionModes] =
    useState<Record<PureSettingsSectionKey, SectionEditorMode>>(createInitialSectionModes);
  const [environmentExpanded, setEnvironmentExpanded] = useState(false);
  const [activeAccordionSection, setActiveAccordionSection] =
    useState<LowFrequencySectionKey | null>(null);
  const [editorErrors, setEditorErrors] = useState<Record<string, string>>({});

  const lowFrequencyErrors = useMemo(
    () => ({
      permissions: editorErrors.permissions || jsonErrors.permissions || "",
      sandbox: editorErrors.sandbox || jsonErrors.sandbox || "",
      hooks: editorErrors.hooks || jsonErrors.hooks || "",
      marketplaces: editorErrors.extraKnownMarketplaces || jsonErrors.marketplaces || "",
      plugins: editorErrors.enabledPlugins || jsonErrors.plugins || "",
    }),
    [
      editorErrors.enabledPlugins,
      editorErrors.extraKnownMarketplaces,
      editorErrors.hooks,
      editorErrors.permissions,
      editorErrors.sandbox,
      jsonErrors.hooks,
      jsonErrors.marketplaces,
      jsonErrors.permissions,
      jsonErrors.plugins,
      jsonErrors.sandbox,
    ],
  );

  const hasEditorErrors = useMemo(() => Object.values(editorErrors).some(Boolean), [editorErrors]);

  useEffect(() => {
    if (editorErrors.env || jsonErrors.env) {
      setEnvironmentExpanded(true);
    }
  }, [editorErrors.env, jsonErrors.env]);

  useEffect(() => {
    const firstErrorSection = LOW_FREQUENCY_SECTION_ORDER.find((section) =>
      Boolean(lowFrequencyErrors[section]),
    );

    if (firstErrorSection) {
      setActiveAccordionSection(firstErrorSection);
    }
  }, [lowFrequencyErrors]);

  function setSectionError(section: string, message: string) {
    setEditorErrors((current) => {
      if (!message) {
        if (!current[section]) {
          return current;
        }

        const next = { ...current };
        delete next[section];
        return next;
      }

      if (current[section] === message) {
        return current;
      }

      return {
        ...current,
        [section]: message,
      };
    });
  }

  function handleSectionModeChange(section: PureSettingsSectionKey, mode: SectionEditorMode) {
    setSectionModes((current) => {
      if (current[section] === mode) {
        return current;
      }

      return {
        ...current,
        [section]: mode,
      };
    });
  }

  function toggleAccordionSection(section: LowFrequencySectionKey) {
    setActiveAccordionSection((current) => (current === section ? null : section));
  }

  function toggleEnvironmentExpanded() {
    setEnvironmentExpanded((current) => !current);
  }

  return {
    sectionModes,
    environmentExpanded,
    activeAccordionSection,
    editorErrors,
    hasEditorErrors,
    setSectionError,
    handleSectionModeChange,
    toggleAccordionSection,
    toggleEnvironmentExpanded,
  };
}

export default useStructuredSettingsSectionState;
