import { ReactNode } from "react";

interface DrawerProps {
  children: ReactNode;
  onClose: () => void;
}

/** 公共抽屉组件：遮罩层 + 侧边滑入面板 */
function Drawer({ children, onClose }: DrawerProps) {
  return (
    <>
      <div className="drawer-overlay visible" onClick={onClose} />
      <div className="drawer open">
        {children}
      </div>
    </>
  );
}

export default Drawer;
