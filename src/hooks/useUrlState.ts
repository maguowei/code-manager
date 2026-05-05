import { useCallback, useEffect, useState } from "react";

/**
 * 把单个 URL 查询参数同步到 React 状态。
 *
 * - 写入用 history.replaceState，不污染前进/后退栈
 * - 默认值不写入 URL，保持地址栏整洁
 * - 监听 popstate，浏览器前进后退时回填状态
 *
 * 设计取舍：项目当前未引入 react-router；为最小侵入实现 URL 同步，
 * 这里复用 window.history + URLSearchParams，只对单 key 生效。
 */
export function useUrlSearchParam(
  key: string,
  defaultValue = "",
): [string, (next: string) => void] {
  const readFromUrl = useCallback((): string => {
    if (typeof window === "undefined") return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return params.get(key) ?? defaultValue;
  }, [key, defaultValue]);

  const [value, setValue] = useState<string>(readFromUrl);

  // popstate 时同步状态
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => {
      setValue(readFromUrl());
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
    };
  }, [readFromUrl]);

  const setUrlValue = useCallback(
    (next: string) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (next === "" || next === defaultValue) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, next);
      }
      const newSearch = url.searchParams.toString();
      const newUrl = `${url.pathname}${newSearch ? `?${newSearch}` : ""}${url.hash}`;
      window.history.replaceState(window.history.state, "", newUrl);
    },
    [key, defaultValue],
  );

  return [value, setUrlValue];
}
