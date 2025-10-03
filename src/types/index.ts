// Types for the ASK system and conversations
export type AskDeliveryMode = "physical" | "digital";
export type AskAudienceScope = "individual" | "group";
export type AskGroupResponseMode = "collective" | "simultaneous";

export interface AskParticipant {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  isSpokesperson?: boolean;
  isActive: boolean;
}

export interface Ask {
  id: string;
  key: string;
  name?: string | null;
  question: string;
  description?: string | null;
  status?: string | null;
  isActive: boolean;
  startDate?: string | null; // ISO string
  endDate: string; // ISO string
  createdAt: string;
  updatedAt: string;
  deliveryMode: AskDeliveryMode;
  audienceScope: AskAudienceScope;
  responseMode: AskGroupResponseMode;
  participants: AskParticipant[];
  askSessionId?: string;
}

// Types for conversation messages
export type MessageSenderType = 'user' | 'ai' | 'system';

export interface Message {
  id: string;
  askKey: string;
  askSessionId?: string;
  content: string;
  type: 'text' | 'audio' | 'image' | 'document';
  senderType: MessageSenderType;
  senderId?: string | null;
  senderName?: string | null;
  timestamp: string;
  metadata?: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    duration?: number; // for audio files
    senderName?: string;
    [key: string]: unknown;
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

export interface InsightKpi {
  id: string;
  label: string;
  value?: Record<string, any>;
  description?: string | null;
}

export type InsightStatus = "new" | "reviewed" | "implemented" | "archived";
export type InsightType = "pain" | "gain" | "opportunity" | "risk" | "signal" | "idea";

export interface InsightAuthor {
  id: string;
  userId?: string | null;
  name?: string | null;
}

export interface Insight {
  id: string;
  askId: string;
  askSessionId: string;
  challengeId?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  authors: InsightAuthor[];
  content: string;
  summary?: string | null;
  type: InsightType;
  category?: string | null;
  status: InsightStatus;
  priority?: string | null;
  createdAt: string;
  updatedAt: string;
  relatedChallengeIds: string[];
  kpis: InsightKpi[];
  sourceMessageId?: string | null;
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
  insights?: Insight[];
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
  insights: Insight[];
  challenges?: Challenge[];
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
  onHumanTyping?: (isTyping: boolean) => void;
  currentParticipantName?: string | null;
  isMultiUser?: boolean;
  showAgentTyping?: boolean;
}

export interface ChallengeComponentProps {
  challenges: Challenge[];
  onUpdateChallenge: (challenge: Challenge) => void;
  askKey: string;
}

export interface InsightPanelProps {
  insights: Insight[];
  onRequestChallengeLink?: (insightId: string) => void;
  askKey: string;
}

// Admin backoffice data
export interface ClientRecord {
  id: string;
  name: string;
  status: string;
  email?: string | null;
  company?: string | null;
  industry?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  role: string;
  clientId?: string | null;
  clientName?: string | null;
  projectIds?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  clientId: string;
  clientName?: string | null;
  startDate: string;
  endDate: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeRecord {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  category?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  parentChallengeId?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  updatedAt: string;
}

export interface AskSessionRecord {
  id: string;
  askKey: string;
  name: string;
  question: string;
  description?: string | null;
  status: string;
  projectId: string;
  projectName?: string | null;
  challengeId?: string | null;
  startDate: string;
  endDate: string;
  isAnonymous: boolean;
  maxParticipants?: number | null;
  deliveryMode: AskDeliveryMode;
  audienceScope: AskAudienceScope;
  responseMode: AskGroupResponseMode;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  participants?: AskParticipant[];
}

export interface AskContact {
  id: string;
  name: string;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  isSpokesperson?: boolean;
}

export interface AskRecord {
  id: string;
  askSessionId: string;
  askKey: string;
  name: string;
  question: string;
  status: string;
  deliveryMode: AskDeliveryMode;
  audienceScope: AskAudienceScope;
  responseMode: AskGroupResponseMode;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

// Types for the project journey board view
export type InsightCategory = "pain" | "gain" | "signal" | "idea";

export interface ProjectInsightKpi {
  id: string;
  label: string;
  current?: string;
  target?: string;
  delta?: string;
  unit?: string;
  comment?: string;
}

export interface ProjectParticipantSummary {
  id: string;
  name: string;
  role?: string;
}

export interface ProjectParticipantInsight {
  id: string;
  title: string;
  type: InsightCategory;
  description: string;
  updatedAt: string;
  isCompleted: boolean;
  relatedChallengeIds: string[];
  kpis: ProjectInsightKpi[];
  contributors?: ProjectParticipantSummary[];
}

export interface ProjectAskParticipant {
  id: string;
  name: string;
  role: string;
  avatarInitials: string;
  avatarColor?: string;
  insights: ProjectParticipantInsight[];
}

export interface ProjectAskOverview {
  id: string;
  title: string;
  summary: string;
  status: string;
  theme: string;
  dueDate: string;
  participants: ProjectAskParticipant[];
  originatingChallengeIds: string[];
  relatedProjects: { id: string; name: string }[];
}

export interface ProjectParticipantOption {
  id: string;
  name: string;
  role: string;
  avatarInitials: string;
  avatarColor?: string;
}

export interface ProjectChallengeNode {
  id: string;
  title: string;
  description: string;
  status: string;
  impact: "low" | "medium" | "high" | "critical";
  owners?: ProjectParticipantSummary[];
  relatedInsightIds: string[];
  children?: ProjectChallengeNode[];
}

export interface ProjectJourneyBoardData {
  projectId: string;
  projectName: string;
  clientName: string;
  projectGoal: string;
  timeframe: string;
  asks: ProjectAskOverview[];
  challenges: ProjectChallengeNode[];
  availableUsers: ProjectParticipantOption[];
}
