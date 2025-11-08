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
  inviteToken?: string | null;
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
  /**
   * Stable identifier used on the client to avoid React remounts while keeping server ids
   */
  clientId?: string;
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
  inviteToken?: string | null; // Token for invite-based access (allows anonymous participation)
  ask: Ask | null;
  messages: Message[];
  insights: Insight[];
  challenges?: Challenge[];
  isLoading: boolean;
  error: string | null;
}

// AI agent configuration
export type AiModelProvider =
  | "anthropic"
  | "vertex_anthropic"
  | "mistral"
  | "openai"
  | "deepgram"
  | "deepgram-voice-agent"
  | "custom";

export interface AiModelConfig {
  id: string;
  code: string;
  name: string;
  provider: AiModelProvider;
  model: string;
  baseUrl?: string | null;
  apiKeyEnvVar: string;
  additionalHeaders?: Record<string, unknown> | null;
  isDefault?: boolean;
  isFallback?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Deepgram-specific fields (stored in additionalHeaders or metadata)
  deepgramSttModel?: string; // e.g., "nova-2"
  deepgramTtsModel?: string; // e.g., "aura-thalia-en"
  deepgramLlmProvider?: "anthropic" | "openai"; // LLM provider for Deepgram Agent
  deepgramLlmModel?: string; // LLM model name
}

export interface AiAgentRecord {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  modelConfigId?: string | null;
  fallbackModelConfigId?: string | null;
  systemPrompt: string;
  userPrompt: string;
  availableVariables: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  modelConfig?: AiModelConfig | null;
  fallbackModelConfig?: AiModelConfig | null;
}

export type AiAgentInteractionStatus = "pending" | "processing" | "completed" | "failed";

export interface AiAgentLog {
  id: string;
  agentId?: string | null;
  modelConfigId?: string | null;
  askSessionId?: string | null;
  messageId?: string | null;
  interactionType: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown> | null;
  status: AiAgentInteractionStatus;
  errorMessage?: string | null;
  latencyMs?: number | null;
  createdAt: string;
}

export type AiInsightJobStatus = "pending" | "processing" | "completed" | "failed";

export interface AiInsightJob {
  id: string;
  askSessionId: string;
  messageId?: string | null;
  agentId?: string | null;
  modelConfigId?: string | null;
  status: AiInsightJobStatus;
  attempts: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface PromptVariableDefinition {
  key: string;
  label: string;
  description: string;
  example?: string;
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
  currentUserId?: string | null;
  isMultiUser?: boolean;
  showAgentTyping?: boolean;
  // Voice mode props
  voiceModeEnabled?: boolean;
  voiceModeSystemPrompt?: string;
  voiceModeModelConfig?: {
    deepgramSttModel?: string;
    deepgramTtsModel?: string;
    deepgramLlmProvider?: "anthropic" | "openai";
    deepgramLlmModel?: string;
  };
  onVoiceMessage?: (role: 'user' | 'agent', content: string) => void;
  onReplyBoxFocusChange?: (isFocused: boolean) => void;
}

export interface ChallengeComponentProps {
  challenges: Challenge[];
  onUpdateChallenge: (challenge: Challenge) => void;
  onDeleteChallenge?: (challengeId: string) => void;
  askKey: string;
}

export interface InsightPanelProps {
  insights: Insight[];
  onRequestChallengeLink?: (insightId: string) => void;
  askKey: string;
  isDetectingInsights?: boolean;
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

export interface ClientMember {
  id: string;
  clientId: string;
  userId: string;
  jobTitle?: string | null; // Client-specific job title
  createdAt: string;
  updatedAt: string;
}

// Auth types - Supabase Auth integration
export interface AuthUser {
  id: string; // auth.users.id from Supabase Auth
  email: string;
  emailConfirmed?: boolean;
  profile?: Profile | null; // Linked profile from public.profiles
}

export interface Profile {
  id: string; // public.profiles.id (UUID)
  authId: string; // References auth.users.id
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  role: string;
  clientId?: string | null;
  clientName?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  lastLogin?: string | null;
  jobTitle?: string | null; // Global job title from profiles table
  createdAt: string;
  updatedAt: string;
}

// Managed user for admin backoffice (extends Profile with additional info)
export interface ManagedUser extends Profile {
  projectIds?: string[];
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
  systemPrompt?: string | null;
  graphRagScope?: "project" | "client";
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
  systemPrompt?: string | null;
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
  jobTitle?: string | null; // Global, client-specific, or project-specific job title
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
  userId?: string | null;
  name: string;
  role: string;
  avatarInitials: string;
  avatarColor?: string;
  insights: ProjectParticipantInsight[];
}

export interface ProjectAskOverview {
  id: string;
  askKey: string;
  title: string;
  summary: string;
  status: string;
  theme: string;
  dueDate: string;
  participants: ProjectAskParticipant[];
  originatingChallengeIds: string[];
  primaryChallengeId?: string | null;
  relatedChallengeIds?: string[];
  relatedProjects: { id: string; name: string }[];
  insights: ProjectParticipantInsight[];
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
  clientName: string | null;
  projectGoal?: string | null;
  timeframe?: string | null;
  projectDescription?: string | null;
  projectStatus?: string | null;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  projectSystemPrompt?: string | null;
  asks: ProjectAskOverview[];
  challenges: ProjectChallengeNode[];
  availableUsers: ProjectParticipantOption[];
}

export interface AiChallengeAgentMetadata {
  logId: string;
  agentId?: string | null;
  modelConfigId?: string | null;
}

export interface AiSubChallengeUpdateSuggestion {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  impact?: ProjectChallengeNode["impact"] | null;
  summary?: string | null;
}

export interface AiFoundationInsight {
  insightId: string;
  title?: string; // Optional: will be fetched from DB if not provided (smart optimization)
  reason: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface AiNewChallengeSuggestion {
  referenceId?: string | null;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  impact?: ProjectChallengeNode["impact"] | null;
  owners?: ProjectParticipantSummary[];
  summary?: string | null;
  foundationInsights?: AiFoundationInsight[];
}

export interface AiChallengeUpdateSuggestion {
  challengeId: string;
  challengeTitle: string;
  summary?: string | null;
  foundationInsights?: AiFoundationInsight[];
  updates?: {
    title?: string | null;
    description?: string | null;
    status?: string | null;
    impact?: ProjectChallengeNode["impact"] | null;
    owners?: ProjectParticipantSummary[];
  } | null;
  subChallengeUpdates?: AiSubChallengeUpdateSuggestion[];
  newSubChallenges?: AiNewChallengeSuggestion[];
  agentMetadata?: AiChallengeAgentMetadata;
  rawResponse?: string | null;
  errors?: string[];
}

export interface AiChallengeBuilderResponse {
  challengeSuggestions: AiChallengeUpdateSuggestion[];
  newChallengeSuggestions: AiNewChallengeSuggestion[];
  errors?: Array<{ challengeId: string | null; message: string }>;
}

export interface AiAskParticipantSuggestion {
  id?: string | null;
  name: string;
  role?: string | null;
  isSpokesperson?: boolean | null;
}

export interface AiAskInsightReference {
  insightId: string;
  title?: string | null;
  reason?: string | null;
  priority?: ProjectChallengeNode["impact"] | null;
}

export interface AiAskSuggestion {
  referenceId?: string | null;
  title: string;
  askKey?: string | null;
  question: string;
  summary?: string | null;
  description?: string | null;
  objective?: string | null;
  recommendedParticipants?: AiAskParticipantSuggestion[];
  relatedInsights?: AiAskInsightReference[];
  followUpActions?: string[];
  confidence?: "low" | "medium" | "high" | null;
  urgency?: ProjectChallengeNode["impact"] | null;
  maxParticipants?: number | null;
  isAnonymous?: boolean | null;
  deliveryMode?: AskDeliveryMode | null;
  audienceScope?: AskAudienceScope | null;
  responseMode?: AskGroupResponseMode | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface AiAskGeneratorResponse {
  suggestions: AiAskSuggestion[];
  errors?: string[];
  rawResponse?: string | null;
}
