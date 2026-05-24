import type { FileContents, MultiFileDiffProps, ThemeTypes } from "@pierre/diffs/react";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { CSSProperties } from "react";

export type SettingsMismatchDiffFile = FileContents;
export type SettingsMismatchDiffOptions = NonNullable<MultiFileDiffProps<undefined>["options"]>;
export type SettingsMismatchDiffThemeType = ThemeTypes;

interface SettingsMismatchDiffViewerProps {
  oldFile: SettingsMismatchDiffFile;
  newFile: SettingsMismatchDiffFile;
  options: SettingsMismatchDiffOptions;
  style: CSSProperties;
}

function SettingsMismatchDiffViewer({
  oldFile,
  newFile,
  options,
  style,
}: SettingsMismatchDiffViewerProps) {
  return <MultiFileDiff oldFile={oldFile} newFile={newFile} options={options} style={style} />;
}

export default SettingsMismatchDiffViewer;
