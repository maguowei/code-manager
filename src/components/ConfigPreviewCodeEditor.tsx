import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorTheme } from "../hooks/useCodeMirrorTheme";

interface ConfigPreviewCodeEditorProps {
  content: string;
  editable: boolean;
  onChange?: (value: string) => void;
}

// 启用 lineWrapping：长 JWT、URL 等单行字符串自动换行，避免水平溢出父容器
const JSON_EXTENSIONS = [json(), EditorView.lineWrapping];
const CODEMIRROR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: false,
};

function ConfigPreviewCodeEditor({ content, editable, onChange }: ConfigPreviewCodeEditorProps) {
  const editorTheme = useCodeMirrorTheme();

  return (
    <CodeMirror
      value={content}
      extensions={JSON_EXTENSIONS}
      theme={editorTheme}
      editable={editable}
      onChange={onChange}
      basicSetup={CODEMIRROR_BASIC_SETUP}
    />
  );
}

export default ConfigPreviewCodeEditor;
