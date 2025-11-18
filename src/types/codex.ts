export type CodexRole = 'user' | 'assistant' | 'system' | 'agent';

export type CodexMessageEvent = {
  role: CodexRole;
  content: string;
  timestamp?: string;
  messageId?: string;
  isInterim?: boolean;
  meta?: Record<string, any>;
};

export type CodexErrorEvent = {
  type: 'error';
  code?: string | number;
  message: string;
  provider?: string;
  raw?: unknown;
};
