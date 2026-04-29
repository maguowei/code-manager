import { readObject } from "./editor-utils";

export const RECOMMENDED_SANDBOX_PRESET = {
  enabled: true,
  autoAllowBashIfSandboxed: true,
  excludedCommands: ["docker *", "git *"],
  network: {
    allowLocalBinding: true,
    allowUnixSockets: ["/var/run/docker.sock"],
  },
} as const;

interface SandboxPresetMergeResult {
  nextValue: Record<string, unknown>;
  changed: boolean;
}

function appendMissingStrings(value: unknown, additions: readonly string[]) {
  const currentItems = Array.isArray(value) ? [...value] : [];
  const currentStrings = new Set(
    currentItems.filter((item): item is string => typeof item === "string"),
  );
  let changed = !Array.isArray(value);

  for (const addition of additions) {
    if (currentStrings.has(addition)) {
      continue;
    }
    currentItems.push(addition);
    currentStrings.add(addition);
    changed = true;
  }

  return {
    value: currentItems,
    changed,
  };
}

export function mergeRecommendedSandboxPreset(value: unknown): SandboxPresetMergeResult {
  const sandboxObject = readObject(value);
  const nextValue: Record<string, unknown> = { ...sandboxObject };
  let changed = false;

  if (nextValue.enabled !== RECOMMENDED_SANDBOX_PRESET.enabled) {
    nextValue.enabled = RECOMMENDED_SANDBOX_PRESET.enabled;
    changed = true;
  }

  if (nextValue.autoAllowBashIfSandboxed !== RECOMMENDED_SANDBOX_PRESET.autoAllowBashIfSandboxed) {
    nextValue.autoAllowBashIfSandboxed = RECOMMENDED_SANDBOX_PRESET.autoAllowBashIfSandboxed;
    changed = true;
  }

  const excludedCommands = appendMissingStrings(
    nextValue.excludedCommands,
    RECOMMENDED_SANDBOX_PRESET.excludedCommands,
  );
  if (excludedCommands.changed) {
    nextValue.excludedCommands = excludedCommands.value;
    changed = true;
  }

  const networkObject = readObject(nextValue.network);
  const nextNetwork: Record<string, unknown> = { ...networkObject };
  let networkChanged = false;

  if (nextNetwork.allowLocalBinding !== RECOMMENDED_SANDBOX_PRESET.network.allowLocalBinding) {
    nextNetwork.allowLocalBinding = RECOMMENDED_SANDBOX_PRESET.network.allowLocalBinding;
    networkChanged = true;
  }

  const allowUnixSockets = appendMissingStrings(
    nextNetwork.allowUnixSockets,
    RECOMMENDED_SANDBOX_PRESET.network.allowUnixSockets,
  );
  if (allowUnixSockets.changed) {
    nextNetwork.allowUnixSockets = allowUnixSockets.value;
    networkChanged = true;
  }

  if (networkChanged) {
    nextValue.network = nextNetwork;
    changed = true;
  }

  return {
    nextValue,
    changed,
  };
}

export function hasRecommendedSandboxPreset(value: unknown): boolean {
  return !mergeRecommendedSandboxPreset(value).changed;
}
