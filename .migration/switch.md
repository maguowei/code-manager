# switch

2026-09-19，transformation engine（legacy `new-york`，无 base 对照风格）。

与 checkbox 同类：Root 渲染 `span` + 隐藏 `input`，数据属性改名。

## Changed

- `src/components/ui/switch.tsx`：改用 `@base-ui/react/switch`；
  `data-[state=checked|unchecked]:` 改为 `data-checked:` / `data-unchecked:`，
  `disabled:` 改为 `data-disabled:`。尺寸与拇指位移类保持不变。
- `src/components/__tests__/ui-system-contract.test.ts`：switch 的类名断言
  同步改为 `data-checked:translate-x-[calc(100%+2px)]`。
- 残留扫描：`grep -n "radix-ui\|@radix-ui" src/components/ui/switch.tsx` 无命中。

## Left alone

- 其它合约测试中与 switch 无关的断言未动。

## Behavior changes

无。

## Verify by hand

1. 设置抽屉里「待处理会话呼吸灯」「浮窗」等开关，滑块位移与选中色正常。
2. 禁用态开关不响应点击，且透明度样式生效。
