import { readObject, readString } from "./editor-utils";

export const MOJIBAKE_PRE_TOOL_USE_COMMAND = String.raw`CMD=$(jq -r '.tool_input.command // empty' </dev/stdin) && echo "$CMD" | grep -q 'git commit' || exit 0 && G=$(printf '\xef\xbf\xbd') && echo "$CMD" | grep -qF "$G" && jq -nc '{"decision":"block","reason":"提交信息包含乱码字符 (U+FFFD)，请修复后再提交"}' || true`;

export const MOJIBAKE_POST_TOOL_USE_COMMAND = String.raw`FILE=$(jq -r '.tool_input.file_path // empty' </dev/stdin) && [ -n "$FILE" ] && [ -f "$FILE" ] && G=$(printf '\xef\xbf\xbd') && RESULT=$(grep -FHn "$G" "$FILE" 2>/dev/null) && [ -n "$RESULT" ] && jq -nc --arg r "$RESULT" '{"decision":"block","reason":("检测到乱码字符 (U+FFFD)，请修复后再继续:\n" + $r)}' || true`;

interface HookPresetAction {
  type: "command";
  command: string;
}

interface HookPresetMatcher {
  matcher: string;
  hooks: HookPresetAction[];
}

const MOJIBAKE_HOOK_PRESET: Record<string, HookPresetMatcher[]> = {
  PreToolUse: [
    {
      matcher: "Bash",
      hooks: [
        {
          type: "command",
          command: MOJIBAKE_PRE_TOOL_USE_COMMAND,
        },
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: "Edit|Write",
      hooks: [
        {
          type: "command",
          command: MOJIBAKE_POST_TOOL_USE_COMMAND,
        },
      ],
    },
  ],
};

interface HookPresetMergeResult {
  nextValue: Record<string, unknown>;
  changed: boolean;
  supported: boolean;
}

function clonePresetMatcher(matcher: HookPresetMatcher): Record<string, unknown> {
  return {
    matcher: matcher.matcher,
    hooks: matcher.hooks.map((hook) => ({
      type: hook.type,
      command: hook.command,
    })),
  };
}

function isSameCommandAction(action: unknown, presetAction: HookPresetAction): boolean {
  const actionRecord = readObject(action);
  return (
    readString(actionRecord.type) === presetAction.type &&
    readString(actionRecord.command) === presetAction.command
  );
}

export function buildMojibakeHookPreset(): Record<string, unknown> {
  return Object.entries(MOJIBAKE_HOOK_PRESET).reduce<Record<string, unknown>>(
    (accumulator, [event, matchers]) => {
      accumulator[event] = matchers.map((matcher) => clonePresetMatcher(matcher));
      return accumulator;
    },
    {},
  );
}

export function mergeMojibakeHookPreset(value: unknown): HookPresetMergeResult {
  const hooksObject = readObject(value);
  const nextValue: Record<string, unknown> = { ...hooksObject };
  let changed = false;

  for (const [event, presetMatchers] of Object.entries(MOJIBAKE_HOOK_PRESET)) {
    const currentEventValue = nextValue[event];
    if (currentEventValue === undefined) {
      nextValue[event] = presetMatchers.map((matcher) => clonePresetMatcher(matcher));
      changed = true;
      continue;
    }

    if (!Array.isArray(currentEventValue)) {
      return {
        nextValue: hooksObject,
        changed: false,
        supported: false,
      };
    }

    const nextMatchers = [...currentEventValue];
    let eventChanged = false;

    for (const presetMatcher of presetMatchers) {
      const matcherIndex = nextMatchers.findIndex(
        (entry) => readString(readObject(entry).matcher) === presetMatcher.matcher,
      );

      if (matcherIndex === -1) {
        nextMatchers.push(clonePresetMatcher(presetMatcher));
        eventChanged = true;
        continue;
      }

      const matcherRecord = readObject(nextMatchers[matcherIndex]);
      const currentHooks = matcherRecord.hooks;
      if (!Array.isArray(currentHooks)) {
        return {
          nextValue: hooksObject,
          changed: false,
          supported: false,
        };
      }

      const nextHooks = [...currentHooks];
      let hooksChanged = false;

      for (const presetAction of presetMatcher.hooks) {
        if (nextHooks.some((action) => isSameCommandAction(action, presetAction))) {
          continue;
        }
        nextHooks.push({
          type: presetAction.type,
          command: presetAction.command,
        });
        hooksChanged = true;
      }

      if (!hooksChanged) {
        continue;
      }

      nextMatchers[matcherIndex] = {
        ...matcherRecord,
        matcher: presetMatcher.matcher,
        hooks: nextHooks,
      };
      eventChanged = true;
    }

    if (!eventChanged) {
      continue;
    }

    nextValue[event] = nextMatchers;
    changed = true;
  }

  return {
    nextValue,
    changed,
    supported: true,
  };
}
