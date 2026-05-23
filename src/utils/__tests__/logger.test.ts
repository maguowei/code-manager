import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableTauriEnv } from "@/test/tauri-mock";

// plugin-log 的五个 level 通过 vi.hoisted 暴露给 vi.mock 工厂；
// 显式 type 参数让 mock.calls 推断为 [string][]，便于断言消息内容
const { logMocks } = vi.hoisted(() => {
  const make = () => vi.fn<(message: string) => Promise<void>>(async () => undefined);
  return {
    logMocks: {
      error: make(),
      warn: make(),
      info: make(),
      debug: make(),
      trace: make(),
    },
  };
});

vi.mock("@tauri-apps/plugin-log", () => logMocks);

import { installGlobalErrorLogging, logger } from "../logger";

describe("logger", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    for (const fn of Object.values(logMocks)) fn.mockClear();
    restoreTauri = enableTauriEnv();
  });

  afterEach(() => {
    restoreTauri();
  });

  describe("level 路由", () => {
    it("info / warn / error / debug / trace 调用各自的底层 writer", () => {
      logger.info("plain message");
      logger.warn("plain message");
      logger.error("plain message");
      logger.debug("plain message");
      logger.trace("plain message");

      expect(logMocks.info).toHaveBeenCalledTimes(1);
      expect(logMocks.warn).toHaveBeenCalledTimes(1);
      expect(logMocks.error).toHaveBeenCalledTimes(1);
      expect(logMocks.debug).toHaveBeenCalledTimes(1);
      expect(logMocks.trace).toHaveBeenCalledTimes(1);
    });
  });

  describe("非 Tauri 环境", () => {
    it("不调用底层 writer", () => {
      restoreTauri();
      restoreTauri = () => undefined;

      logger.info("ignored");
      logger.error("ignored");

      expect(logMocks.info).not.toHaveBeenCalled();
      expect(logMocks.error).not.toHaveBeenCalled();
    });
  });

  describe("脱敏", () => {
    function lastMessage(level: keyof typeof logMocks): string {
      const calls = logMocks[level].mock.calls;
      const last = calls[calls.length - 1];
      if (!last) throw new Error(`logger.${level} 未被调用`);
      return last[0];
    }

    it("形如 TOKEN=xxx 的环境变量赋值会被打码", () => {
      logger.info("DEPLOY_TOKEN=sk-abc-123 step=ok");
      const printed = lastMessage("info");
      expect(printed).not.toContain("sk-abc-123");
      expect(printed).toContain("<redacted>");
      expect(printed).toContain("step=ok"); // 无关字段保留
    });

    it('形如 token: "..." 的对象样式会被打码', () => {
      logger.warn('payload={"api_key":"sk-secret","user":"u1"}');
      const printed = lastMessage("warn");
      expect(printed).not.toContain("sk-secret");
      expect(printed).toContain("<redacted>");
      expect(printed).toContain("u1"); // 非敏感字段保留
    });

    it("Authorization: Bearer xxx 会被打码", () => {
      logger.error("request failed Authorization: Bearer abc.def.ghi");
      const printed = lastMessage("error");
      expect(printed).not.toContain("abc.def.ghi");
      expect(printed).toMatch(/authorization: <redacted>/i);
    });

    it("不含敏感字段的消息原样输出", () => {
      logger.info("event=profile.apply status=ok profile_id=p1");
      expect(lastMessage("info")).toBe("event=profile.apply status=ok profile_id=p1");
    });
  });
});

describe("installGlobalErrorLogging", () => {
  let restoreTauri: () => void;

  beforeEach(() => {
    for (const fn of Object.values(logMocks)) fn.mockClear();
    restoreTauri = enableTauriEnv();
  });

  afterEach(() => {
    restoreTauri();
  });

  it("非 Tauri 环境不注册任何监听器", () => {
    restoreTauri();
    restoreTauri = () => undefined;
    const addSpy = vi.spyOn(window, "addEventListener");

    installGlobalErrorLogging();

    expect(addSpy).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it("Tauri 环境下注册 error 与 unhandledrejection，并把异常信息打码后写入日志", () => {
    installGlobalErrorLogging();

    // window.error: 通过派发 ErrorEvent 触发
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "boom",
        error: new Error("payload TOKEN=sk-123"),
      }),
    );

    // unhandledrejection: jsdom 没有原生构造器，自行造一个事件
    const rejection = new Event("unhandledrejection") as Event & { reason?: unknown };
    rejection.reason = "rejected: api_key=sk-xyz";
    window.dispatchEvent(rejection);

    expect(logMocks.error.mock.calls.length).toBeGreaterThanOrEqual(2);
    const messages = logMocks.error.mock.calls.map((c) => c[0]);
    expect(messages.some((m) => m.includes("frontend.error"))).toBe(true);
    expect(messages.some((m) => m.includes("frontend.unhandled_rejection"))).toBe(true);
    // 确认敏感字段已被打码
    for (const msg of messages) {
      expect(msg).not.toContain("sk-123");
      expect(msg).not.toContain("sk-xyz");
    }
  });

  it("重复调用 installGlobalErrorLogging 只注册一次监听器", () => {
    const addSpy = vi.spyOn(window, "addEventListener");

    installGlobalErrorLogging();
    const firstCount = addSpy.mock.calls.length;
    installGlobalErrorLogging();
    const secondCount = addSpy.mock.calls.length;

    expect(secondCount).toBe(firstCount);
    addSpy.mockRestore();
  });
});
