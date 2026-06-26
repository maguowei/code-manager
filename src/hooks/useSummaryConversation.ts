import {
  type AppendMessage,
  type ThreadMessageLike,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { showOperationError } from "@/lib/user-facing-error";
import type { SummaryIntent } from "../bindings";
import { useI18n } from "../i18n";
import { ipc } from "../ipc";
import { yesterdayKey } from "../lib/work-summary-date";
import { isTauri } from "../types";
import useTauriEvent from "./useTauriEvent";
import { useToast } from "./useToast";

export type ChatProcess = { phase: "scanning" | "summarizing" | "done"; prompt?: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  ts: string;
  content: string;
  intent?: SummaryIntent;
  docPath?: string;
  process?: ChatProcess;
  streaming?: boolean;
};

const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);

/** ChatMessage → assistant-ui ThreadMessageLike；intent/process/docPath 放 metadata.custom */
export function toThreadMessage(m: ChatMessage): ThreadMessageLike {
  return {
    role: m.role,
    content: [{ type: "text", text: m.content }],
    id: m.id,
    metadata: {
      custom: { intent: m.intent, process: m.process, docPath: m.docPath, streaming: m.streaming },
    },
  };
}

/** 流式增量：按 messageId 追加到对应消息 content */
export function appendToken(
  messages: ChatMessage[],
  evt: { messageId: string; delta: string },
): ChatMessage[] {
  return messages.map((m) =>
    m.id === evt.messageId ? { ...m, content: m.content + evt.delta } : m,
  );
}

type ProgressEvent = { messageId?: string; phase: string; prompt?: string };
type TokenEvent = { messageId: string; delta: string };

export function useSummaryConversation(language: "zh" | "en") {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cliAvailable, setCliAvailable] = useState(true);

  useTauriEvent<TokenEvent>("work-summary-token", (e) =>
    setMessages((prev) => appendToken(prev, e)),
  );
  useTauriEvent<ProgressEvent>("work-summary-progress", (e) => {
    if (!e.messageId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === e.messageId
          ? {
              ...m,
              process: {
                phase:
                  e.phase === "scanning" ? "scanning" : e.phase === "done" ? "done" : "summarizing",
                prompt: e.prompt ?? m.process?.prompt,
              },
            }
          : m,
      ),
    );
  });

  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      try {
        const [conv, cli] = await Promise.all([ipc.loadConversation(), ipc.checkClaudeCli()]);
        setMessages(
          conv.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            ts: m.ts,
            content: m.content,
            intent: m.intent ?? undefined,
            docPath: m.docPath ?? undefined,
          })),
        );
        setCliAvailable(cli.available);
      } catch (error) {
        showOperationError(showToast, t("worklog.loadError"), error);
      }
    })();
  }, [showToast, t]);

  const runIntent = useCallback(
    async (userText: string, intent: SummaryIntent) => {
      setIsRunning(true);
      const assistantId = newId();
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "user", ts: nowIso(), content: userText },
        {
          id: assistantId,
          role: "assistant",
          ts: nowIso(),
          content: "",
          intent,
          streaming: true,
          process: { phase: "scanning" },
        },
      ]);
      try {
        const doc = await ipc.generateSummaryStream(intent, language, assistantId);
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: doc.content, docPath: doc.path || undefined, streaming: false }
              : m,
          );
          void ipc
            .saveConversation(
              next.map((m) => ({
                id: m.id,
                role: m.role,
                ts: m.ts,
                content: m.content,
                intent: m.intent ?? null,
                docPath: m.docPath ?? null,
                style: m.intent?.style ?? null,
              })),
            )
            .catch(() => showToast(t("worklog.saveError"), "error"));
          return next;
        });
      } catch (error) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        showOperationError(showToast, t("worklog.generateError"), error);
      } finally {
        setIsRunning(false);
      }
    },
    [language, showToast, t],
  );

  const onNew = useCallback(
    async (msg: AppendMessage) => {
      const text = msg.content
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("")
        .trim();
      if (!text) return;
      try {
        const intent = await ipc.parseSummaryIntent(text, todayKey());
        await runIntent(text, intent);
      } catch (error) {
        showOperationError(showToast, t("worklog.intentError"), error);
      }
    },
    [runIntent, showToast, t],
  );

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: toThreadMessage,
    onNew,
  });

  const runQuickAction = useCallback(
    (kind: "day" | "week") => {
      const intent: SummaryIntent =
        kind === "day"
          ? {
              kind: "day",
              start: yesterdayKey(),
              end: yesterdayKey(),
              projectFilter: [],
              style: "default",
              title: `${yesterdayKey()} 工作总结`,
            }
          : {
              kind: "week",
              start: todayKey(),
              end: todayKey(),
              projectFilter: [],
              style: "default",
              title: "本周工作总结",
            };
      void runIntent(
        kind === "day" ? t("worklog.summarizeYesterday") : t("worklog.generateWeek"),
        intent,
      );
    },
    [runIntent, t],
  );

  return useMemo(
    () => ({ runtime, cliAvailable, runQuickAction }),
    [runtime, cliAvailable, runQuickAction],
  );
}
