export interface EditorExitGuard {
  requestExit: (action: () => void) => void;
}
