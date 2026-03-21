export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type AssistAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  instruction: (content: string) => string;
};

export type ToolbarAction = {
  icon: React.ReactNode;
  title: string;
  fn: (text: string, sel: { start: number; end: number }) => { value: string; cursor: number };
};
