// Types for the ASK system and conversations
export interface Ask {
  id: string;
  key: string;
  question: string;
  isActive: boolean;
  endDate: string; // ISO string
  createdAt: string;
  updatedAt: string;
}

// Types for conversation messages
export interface Message {
  id: string;
  askKey: string;
  content: string;
  type: 'text' | 'audio' | 'image' | 'document';
  sender: 'user' | 'ai';
  timestamp: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number; // for audio files
  };
}

// Types for challenges and their components
export interface KpiEstimation {
  description: string;
  value: Record<string, any>; // Flexible JSON format for KPI data
}

export interface Pain {
  id: string;
  name: string;
  description: string;
  kpiEstimations: KpiEstimation[];
}

export interface Gain {
  id: string;
  name: string;
  description: string;
  kpiEstimations: KpiEstimation[];
}

export interface Challenge {
  id: string;
  name: string;
  pains: Pain[];
  gains: Gain[];
  updatedAt: string;
  isHighlighted?: boolean; // For visual feedback on updates
}

// Types for webhook payloads
export interface WebhookAskPayload {
  askKey: string;
  question: string;
  endDate: string;
}

export interface WebhookResponsePayload {
  askKey: string;
  content: string;
  type: 'text' | 'audio' | 'image' | 'document';
  metadata?: Message['metadata'];
}

export interface WebhookChallengePayload {
  askKey: string;
  challenges: Challenge[];
  action: 'update' | 'replace';
}

// Types for API responses
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Types for file uploads
export interface FileUpload {
  file: File;
  type: 'audio' | 'image' | 'document';
  preview?: string; // For images
}

// Types for session data
export interface SessionData {
  askKey: string;
  ask: Ask | null;
  messages: Message[];
  challenges: Challenge[];
  isLoading: boolean;
  error: string | null;
}

// Types for component props
export interface ChatComponentProps {
  askKey: string;
  ask: Ask | null;
  messages: Message[];
  onSendMessage: (content: string, type?: Message['type'], metadata?: Message['metadata']) => void;
  isLoading: boolean;
}

export interface ChallengeComponentProps {
  challenges: Challenge[];
  onUpdateChallenge: (challenge: Challenge) => void;
  askKey: string;
}
