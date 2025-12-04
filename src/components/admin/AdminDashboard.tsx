"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  Compass,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  Pencil,
  MessageSquare,
  Network,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  X,
  Mail,
  Copy,
  Check
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ProjectJourneyBoard } from "@/components/project/ProjectJourneyBoard";
import { AskRelationshipCanvas } from "./AskRelationshipCanvas";
import { FormDateTimeField } from "./FormDateTimeField";
import { GraphRAGPanel } from "./GraphRAGPanel";
import { SecurityPanel } from "./SecurityPanel";
import { AskPromptTemplateSelector } from "./AskPromptTemplateSelector";
import { useAdminResources } from "./useAdminResources";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserSearchCombobox } from "@/components/ui/user-search-combobox";
import { useAdminSearch, type SearchResultType, type SearchResultItem } from "./AdminSearchContext";
import type { ApiResponse, AskSessionRecord, ChallengeRecord, ClientRecord, ManagedUser, ProjectRecord } from "@/types";

interface AdminDashboardProps {
  initialProjectId?: string | null;
  mode?: "default" | "project-relationships";
}

const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().email("Invalid email address").max(255).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).default("active")
});

const projectStatuses = ["active", "paused", "completed", "archived"] as const;

const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
  status: z.enum(projectStatuses),
  createdBy: z.string().trim().optional().or(z.literal(""))
});

const challengeStatuses = ["open", "in_progress", "active", "closed", "archived"] as const;
const challengePriorities = ["low", "medium", "high", "critical"] as const;

const challengeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  status: z.enum(challengeStatuses),
  priority: z.enum(challengePriorities),
  category: z.string().trim().max(100).optional().or(z.literal("")),
  assignedTo: z.string().trim().optional().or(z.literal("")),
  dueDate: z.string().trim().optional().or(z.literal(""))
});

const askStatuses = ["active", "inactive", "draft", "closed"] as const;
const deliveryModes = ["physical", "digital"] as const;
const conversationModes = ["individual_parallel", "collaborative", "group_reporter"] as const;

const askFormSchema = z.object({
  askKey: z.string().trim().min(3, "Key is required").max(255).regex(/^[a-zA-Z0-9._-]+$/),
  name: z.string().trim().min(1, "Name is required").max(255),
  question: z.string().trim().min(5, "Question is too short").max(2000),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  startDate: z.string().trim().min(1, "Start date is required"),
  endDate: z.string().trim().min(1, "End date is required"),
  status: z.enum(askStatuses),
  isAnonymous: z.boolean().default(false),
  maxParticipants: z
    .preprocess(value => (value === "" || value === undefined || value === null ? undefined : Number(value)), z
      .number()
      .int()
      .positive()
      .max(10000)
      .optional()
    ),
  deliveryMode: z.enum(deliveryModes),
  conversationMode: z.enum(conversationModes),
  participantIds: z.array(z.string().uuid()).default([]),
  participantEmails: z.array(z.string().email()).default([]),
  spokespersonId: z.string().uuid().optional().or(z.literal("")),
  spokespersonEmail: z.string().email().optional().or(z.literal("")),
  systemPrompt: z.string().trim().optional().or(z.literal(""))
});

const userRoles = ["full_admin", "admin", "moderator", "facilitator", "participant", "sponsor", "observer", "guest"] as const;

const userFormSchema = z.object({
  email: z.string().trim().email("Invalid email").max(255),
  fullName: z.string().trim().max(200).optional().or(z.literal("")),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(userRoles).default("participant"),
  clientId: z.string().trim().optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

type ClientFormInput = z.infer<typeof clientFormSchema>;
type ProjectFormInput = z.infer<typeof projectFormSchema>;
type ChallengeFormInput = z.infer<typeof challengeFormSchema>;
type AskFormInput = z.infer<typeof askFormSchema>;
type UserFormInput = z.infer<typeof userFormSchema>;

const gradientButtonClasses = "btn-gradient";

type ColumnWidths = [number, number, number];

const defaultColumnWidths: ColumnWidths = [320, 360, 460];
const minColumnWidths: ColumnWidths = [260, 300, 360];
const maxColumnWidths: ColumnWidths = [520, 560, 680];

const defaultClientFormValues: ClientFormInput = {
  name: "",
  email: "",
  company: "",
  industry: "",
  status: "active"
};

const defaultProjectFormValues: ProjectFormInput = {
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  status: "active",
  createdBy: ""
};

const defaultAskFormValues: AskFormInput = {
  askKey: "",
  name: "",
  question: "",
  description: "",
  startDate: "",
  endDate: "",
  status: "active",
  isAnonymous: false,
  maxParticipants: undefined,
  deliveryMode: "digital",
  conversationMode: "collaborative",
  participantIds: [],
  participantEmails: [],
  spokespersonId: "",
  spokespersonEmail: "",
  systemPrompt: ""
};

const defaultUserFormValues: UserFormInput = {
  email: "",
  fullName: "",
  firstName: "",
  lastName: "",
  role: "participant",
  clientId: "",
  isActive: true,
  jobTitle: ""
};

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, targetId: "section-dashboard" },
  { label: "Clients", icon: Building2, targetId: "section-clients" },
  { label: "Projects", icon: FolderKanban, targetId: "section-projects" },
  { label: "Challenges", icon: Target, targetId: "section-challenges" },
  { label: "ASK Sessions", icon: MessageSquare, targetId: "section-asks" },
  { label: "Users", icon: Users, targetId: "section-users" },
  { label: "Insights", icon: ClipboardList, targetId: "section-insights" },
  { label: "Graph RAG", icon: Network, targetId: "section-graph-rag" },
  { label: "Settings", icon: Settings, targetId: "section-settings" }
] as const;

type SectionId = (typeof navigationItems)[number]["targetId"];
type SectionLabel = (typeof navigationItems)[number]["label"];

const searchResultTypeConfig: Record<SearchResultType, { label: string; icon: LucideIcon }> = {
  client: { label: "Client", icon: Building2 },
  project: { label: "Project", icon: FolderKanban },
  challenge: { label: "Challenge", icon: Target },
  ask: { label: "ASK Session", icon: MessageSquare },
  user: { label: "User", icon: Users }
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function generateAskKey(base: string) {
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `${slug || "ask"}-${randomSuffix}`;
}

function toInputDate(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString();
}

function formatDisplayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "—";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "—";
}

interface ChallengeDetailDialogProps {
  challenge: ChallengeRecord | null;
  projectName?: string | null;
  askCount: number;
  onClose: () => void;
}

function ChallengeDetailDialog({ challenge, projectName, askCount, onClose }: ChallengeDetailDialogProps) {
  return (
    <Dialog.Root open={Boolean(challenge)} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {challenge && (
            <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">{challenge.name}</Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-300">
                    Challenge lié au projet {formatDisplayValue(projectName)}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>

              {challenge.description && (
                <p className="mt-4 text-sm leading-relaxed text-slate-200">{challenge.description}</p>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Statut</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.status)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Priorité</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.priority)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Catégorie</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.category)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Responsable</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.assignedTo)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Échéance</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(formatDateTime(challenge.dueDate))}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Sessions ASK reliées</p>
                  <p className="mt-1 text-sm font-medium text-white">{askCount}</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-400">Dernière mise à jour</p>
                <p className="mt-1 font-medium text-white">{formatDisplayValue(formatDateTime(challenge.updatedAt))}</p>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface AskDetailDialogProps {
  ask: AskSessionRecord | null;
  projectName?: string | null;
  challengeName?: string | null;
  onClose: () => void;
}

function AskDetailDialog({ ask, projectName, challengeName, onClose }: AskDetailDialogProps) {
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [sendInvitesResult, setSendInvitesResult] = useState<{ sent: number; failed: number } | null>(null);
  const [copiedLinks, setCopiedLinks] = useState<Set<string>>(new Set());

  // Dynamically import to avoid SSR issues
  const generateMagicLinkUrl = (email: string, askKey: string, participantToken?: string | null): string => {
    const baseUrl = typeof window !== "undefined" 
      ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // If we have a participant token, use it for a unique link per participant
    if (participantToken) {
      return `${baseUrl}/?token=${participantToken}`;
    }
    
    // Otherwise, use the askKey (backward compatible)
    return `${baseUrl}/?key=${askKey}`;
  };

  const handleSendInvites = async () => {
    if (!ask) return;
    
    setIsSendingInvites(true);
    setSendInvitesResult(null);
    
    try {
      const response = await fetch(`/api/admin/asks/${ask.id}/send-invites`, {
        method: "POST",
      });
      
      const data = await response.json();
      
      if (data.success) {
        setSendInvitesResult({
          sent: data.data.sent,
          failed: data.data.failed,
        });
      } else {
        setSendInvitesResult({
          sent: 0,
          failed: ask.participants?.length || 0,
        });
      }
    } catch (error) {
      console.error("Failed to send invites:", error);
      setSendInvitesResult({
        sent: 0,
        failed: ask.participants?.length || 0,
      });
    } finally {
      setIsSendingInvites(false);
    }
  };

  const copyToClipboard = async (text: string, participantId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLinks(prev => new Set([...prev, participantId]));
      setTimeout(() => {
        setCopiedLinks(prev => {
          const next = new Set(prev);
          next.delete(participantId);
          return next;
        });
      }, 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <Dialog.Root open={Boolean(ask)} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {ask && (
            <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">{ask.name}</Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-300">
                    ASK rattaché au challenge {formatDisplayValue(challengeName)} ({formatDisplayValue(projectName)})
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Question</p>
                  <p className="mt-2 text-sm font-medium text-white">{ask.question}</p>
                </div>
                {ask.description && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Description</p>
                    <p className="mt-2 leading-relaxed text-slate-200">{ask.description}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Statut</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(ask.status)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Clé ASK</p>
                  <p className="mt-1 text-sm font-medium text-white">{ask.askKey}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Projet</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(projectName)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Challenge</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challengeName)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Delivery mode</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {ask.deliveryMode === "physical" ? "In-person" : "Digital"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Audience</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {ask.audienceScope === "individual" ? "Individual" : "Group"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Response mode</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {ask.audienceScope === "group"
                      ? ask.responseMode === "collective"
                        ? "Spokesperson"
                        : "Simultaneous"
                      : "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Début</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(formatDateTime(ask.startDate))}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Fin</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(formatDateTime(ask.endDate))}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Anonyme</p>
                  <p className="mt-1 text-sm font-medium text-white">{ask.isAnonymous ? "Oui" : "Non"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Participants max.</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(ask.maxParticipants)}</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Créée le</p>
                  <p className="mt-1 font-medium text-white">{formatDisplayValue(formatDateTime(ask.createdAt))}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Mise à jour</p>
                  <p className="mt-1 font-medium text-white">{formatDisplayValue(formatDateTime(ask.updatedAt))}</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Participants</p>
                  {ask.participants && ask.participants.length > 0 && (
                    <Button
                      type="button"
                      variant="glassDark"
                      size="sm"
                      onClick={handleSendInvites}
                      disabled={isSendingInvites}
                      className="h-8 px-3 text-xs"
                    >
                      {isSendingInvites ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="h-3 w-3 mr-2" />
                          Send Invites
                        </>
                      )}
                    </Button>
                  )}
                </div>
                {sendInvitesResult && (
                  <div className={`mb-3 rounded-lg p-2 text-xs ${
                    sendInvitesResult.failed === 0 
                      ? "bg-green-500/20 text-green-200" 
                      : "bg-amber-500/20 text-amber-200"
                  }`}>
                    {sendInvitesResult.sent > 0 && (
                      <p>✓ Sent {sendInvitesResult.sent} invite{sendInvitesResult.sent !== 1 ? "s" : ""}</p>
                    )}
                    {sendInvitesResult.failed > 0 && (
                      <p>⚠ Failed to send {sendInvitesResult.failed} invite{sendInvitesResult.failed !== 1 ? "s" : ""}</p>
                    )}
                  </div>
                )}
                {ask.participants && ask.participants.length > 0 ? (
                  <div className="mt-2 space-y-3">
                    {ask.participants.map(participant => {
                      const participantEmail = participant.email;
                      const magicLink = participantEmail 
                        ? generateMagicLinkUrl(participantEmail, ask.askKey, participant.inviteToken) 
                        : (participant.inviteToken ? generateMagicLinkUrl("", ask.askKey, participant.inviteToken) : null);
                      const isCopied = copiedLinks.has(participant.id);
                      
                      return (
                        <div key={participant.id} className="rounded-lg border border-white/10 bg-slate-900/40 p-3">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <div>
                              <p className="font-medium text-white">{participant.name}</p>
                              {participantEmail && (
                                <p className="text-xs text-slate-400">{participantEmail}</p>
                              )}
                            </div>
                            <span className="text-xs text-slate-400">
                              {participant.isSpokesperson ? "Spokesperson" : participant.role || "Participant"}
                            </span>
                          </div>
                          {magicLink && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                value={magicLink}
                                className="flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 font-mono"
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                              />
                              <button
                                type="button"
                                onClick={() => copyToClipboard(magicLink, participant.id)}
                                className="rounded-lg border border-white/10 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"
                                title="Copy link"
                              >
                                {isCopied ? (
                                  <Check className="h-4 w-4 text-green-400" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">No participants assigned yet.</p>
                )}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AdminDashboard({ initialProjectId = null, mode = "default" }: AdminDashboardProps = {}) {
  const router = useRouter();
  const { profile, status, user, signOut } = useAuth();
  const searchContext = useAdminSearch();
  const {
    clients,
    users,
    projects,
    challenges,
    asks,
    feedback,
    setFeedback,
    isLoading,
    isBusy,
    createClient,
    updateClient,
    createUser,
    updateUser,
    createProject,
    updateProject,
    updateChallenge,
    createAsk,
    updateAsk,
    deleteUser,
    deleteClient,
    deleteProject,
    deleteChallenge,
    deleteAsk,
    addUserToProject,
    removeUserFromProject,
    findUserByEmail,
    createUserAndAddToProject,
    refreshAsks
  } = useAdminResources();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId ?? null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  const [showClientForm, setShowClientForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showAskForm, setShowAskForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [manualAskKey, setManualAskKey] = useState(false);
  const [selectedUserForProject, setSelectedUserForProject] = useState<ManagedUser | null>(null);
  const [showJourneyBoard, setShowJourneyBoard] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionLabel>(navigationItems[0].label);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(defaultColumnWidths);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [useVectorSearch, setUseVectorSearch] = useState(false);
  const [vectorSearchResults, setVectorSearchResults] = useState<Array<{ id: string; type: string; score?: number; method: string }>>([]);
  const [isVectorSearching, setIsVectorSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchBlurTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingAskId, setEditingAskId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [challengeDetailId, setChallengeDetailId] = useState<string | null>(null);
  const [askDetailId, setAskDetailId] = useState<string | null>(null);
  const [isSendingInvites, setIsSendingInvites] = useState(false);

  const showOnlyChallengeWorkspace = mode === "project-relationships";

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const dashboardRef = useRef<HTMLDivElement>(null);
  const clientsRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const challengesRef = useRef<HTMLDivElement>(null);
  const asksRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<HTMLDivElement>(null);
  const insightsRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const graphRagRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const sectionRefMap = useMemo<Record<SectionId, RefObject<HTMLDivElement | null>>>(
    () => ({
      "section-dashboard": dashboardRef,
      "section-clients": clientsRef,
      "section-projects": projectsRef,
      "section-challenges": challengesRef,
      "section-asks": asksRef,
      "section-users": usersRef,
      "section-insights": insightsRef,
      "section-graph-rag": graphRagRef,
      "section-settings": settingsRef
    }),
    []
  );

  useEffect(() => {
    return () => {
      if (searchBlurTimeoutRef.current) {
        clearTimeout(searchBlurTimeoutRef.current);
      }
    };
  }, []);

  // Reload ASK data when editing to ensure tokens are generated
  useEffect(() => {
    if (editingAskId && showAskForm) {
      const reloadAsk = async () => {
        try {
          // First, fetch the specific ASK to trigger token generation
          const response = await fetch(`/api/admin/asks/${editingAskId}`, {
            credentials: "include",
          });
          if (response.ok) {
            // Then refresh all asks to update the cache
            await refreshAsks();
          }
        } catch (error) {
          console.error("Error reloading ASK:", error);
        }
      };
      reloadAsk();
    }
  }, [editingAskId, showAskForm, refreshAsks]);

  const navigationMenu = useMemo(() => {
    if (showOnlyChallengeWorkspace) {
      return navigationItems.filter(item =>
        item.targetId === "section-challenges" || item.targetId === "section-asks"
      );
    }
    return navigationItems;
  }, [showOnlyChallengeWorkspace]);


  useEffect(() => {
    if (!navigationMenu.some(item => item.label === activeSection)) {
      setActiveSection(navigationMenu[0]?.label ?? navigationItems[0].label);
    }
  }, [navigationMenu, activeSection]);

  useEffect(() => {
    if (showOnlyChallengeWorkspace) {
      setActiveSection("Challenges");
    }
  }, [showOnlyChallengeWorkspace]);


  const resizeStartXRef = useRef(0);
  const startColumnWidthsRef = useRef<ColumnWidths>(defaultColumnWidths);
  const activeResizeIndexRef = useRef<number | null>(null);

  const clientForm = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: defaultClientFormValues
  });

  const projectForm = useForm<ProjectFormInput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: defaultProjectFormValues
  });

  const challengeForm = useForm<ChallengeFormInput>({
    resolver: zodResolver(challengeFormSchema),
    defaultValues: {
      name: "",
      description: "",
      status: "open",
      priority: "medium",
      category: "",
      assignedTo: "",
      dueDate: ""
    }
  });

  const askForm = useForm<AskFormInput>({
    resolver: zodResolver(askFormSchema),
    defaultValues: defaultAskFormValues
  });

  const userForm = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultUserFormValues
  });

  const askNameValue = askForm.watch("name");
  const selectedConversationMode = askForm.watch("conversationMode");
  const selectedParticipants = askForm.watch("participantIds");
  const selectedSpokesperson = askForm.watch("spokespersonId");
  const participantEmails = askForm.watch("participantEmails") ?? [];
  const [emailInput, setEmailInput] = useState("");
  const [copiedLinks, setCopiedLinks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  useEffect(() => {
    if (!showOnlyChallengeWorkspace) {
      return;
    }
    if (!selectedProjectId) {
      return;
    }
    const project = projects.find(item => item.id === selectedProjectId);
    if (project && project.clientId !== selectedClientId) {
      setSelectedClientId(project.clientId ?? null);
    }
  }, [projects, selectedProjectId, showOnlyChallengeWorkspace, selectedClientId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const updateMatch = () => setIsLargeScreen(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, []);

  useEffect(() => {
    if (!manualAskKey && askNameValue && !askForm.getValues("askKey")) {
      askForm.setValue("askKey", generateAskKey(askNameValue));
    }
  }, [askNameValue, manualAskKey, askForm]);

  useEffect(() => {
    if (selectedSpokesperson && !selectedParticipants.includes(selectedSpokesperson)) {
      askForm.setValue("spokespersonId", "", { shouldDirty: true });
    }
  }, [askForm, selectedParticipants, selectedSpokesperson]);

  useEffect(() => {
    // Clear spokesperson if not in group_reporter mode
    if (selectedConversationMode !== "group_reporter") {
      if (askForm.getValues("spokespersonId")) {
        askForm.setValue("spokespersonId", "", { shouldDirty: true });
      }
    }
  }, [askForm, selectedConversationMode]);

  useEffect(() => {
    if (clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

  const clientById = useMemo(() => {
    const map = new Map<string, ClientRecord>();
    clients.forEach(client => {
      map.set(client.id, client);
    });
    return map;
  }, [clients]);

  const projectById = useMemo(() => {
    const map = new Map<string, ProjectRecord>();
    projects.forEach(project => {
      map.set(project.id, project);
    });
    return map;
  }, [projects]);

  const challengeById = useMemo(() => {
    const map = new Map<string, ChallengeRecord>();
    challenges.forEach(challenge => {
      map.set(challenge.id, challenge);
    });
    return map;
  }, [challenges]);

  const searchResults = useMemo<SearchResultItem[]>(() => {
    if (!normalizedSearchQuery) {
      return [];
    }

    const results: SearchResultItem[] = [];
    const seen = new Set<string>();

    const addResult = (result: SearchResultItem) => {
      const key = `${result.type}-${result.id}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      results.push(result);
    };

    const matchesText = (value?: string | null | number) => {
      if (value === null || value === undefined) {
        return false;
      }
      const text = typeof value === "number" ? value.toString() : value;
      return text.toLowerCase().includes(normalizedSearchQuery);
    };

    clients.forEach(client => {
      if (
        matchesText(client.name) ||
        matchesText(client.email) ||
        matchesText(client.company) ||
        matchesText(client.industry)
      ) {
        addResult({
          id: client.id,
          type: "client",
          title: client.name,
          subtitle: client.company || client.industry || client.email || undefined,
          clientId: client.id
        });
      }
    });

    projects.forEach(project => {
      if (
        matchesText(project.name) ||
        matchesText(project.description) ||
        matchesText(project.status) ||
        matchesText(project.createdBy)
      ) {
        const parentClient = clientById.get(project.clientId);
        addResult({
          id: project.id,
          type: "project",
          title: project.name,
          subtitle:
            [parentClient?.name, project.status].filter(Boolean).join(" • ") || undefined,
          clientId: project.clientId,
          projectId: project.id
        });
      }
    });

    challenges.forEach(challenge => {
      if (
        matchesText(challenge.name) ||
        matchesText(challenge.description) ||
        matchesText(challenge.status) ||
        matchesText(challenge.priority) ||
        matchesText(challenge.category) ||
        matchesText(challenge.assignedTo)
      ) {
        const parentProject = challenge.projectId ? projectById.get(challenge.projectId) : undefined;
        const parentClient = parentProject ? clientById.get(parentProject.clientId) : undefined;
        const statusParts = [challenge.status, challenge.priority].filter(Boolean);

        addResult({
          id: challenge.id,
          type: "challenge",
          title: challenge.name,
          subtitle:
            [
              parentProject?.name,
              parentClient?.name,
              statusParts.length > 0 ? statusParts.join(" • ") : null
            ]
              .filter(Boolean)
              .join(" • ") || undefined,
          clientId: parentClient?.id ?? parentProject?.clientId ?? null,
          projectId: challenge.projectId ?? null,
          challengeId: challenge.id
        });
      }
    });

    asks.forEach(ask => {
      if (
        matchesText(ask.name) ||
        matchesText(ask.question) ||
        matchesText(ask.description) ||
        matchesText(ask.askKey) ||
        matchesText(ask.status)
      ) {
        const parentProject = projectById.get(ask.projectId);
        const parentClient = parentProject ? clientById.get(parentProject.clientId) : undefined;
        const parentChallenge = ask.challengeId ? challengeById.get(ask.challengeId) : undefined;
        const subtitleParts = [parentProject?.name, parentChallenge?.name, ask.askKey].filter(Boolean);

        addResult({
          id: ask.id,
          type: "ask",
          title: ask.name,
          subtitle: subtitleParts.join(" • ") || undefined,
          clientId: parentClient?.id ?? parentProject?.clientId ?? null,
          projectId: ask.projectId,
          challengeId: ask.challengeId ?? null
        });
      }
    });

    users.forEach(user => {
      const displayName = (
        user.fullName ||
        `${user.firstName ?? ""} ${user.lastName ?? ""}` ||
        ""
      ).trim();
      const nameValue = displayName.length > 0 ? displayName : null;

      if (
        matchesText(nameValue) ||
        matchesText(user.email) ||
        matchesText(user.role) ||
        matchesText(user.clientName)
      ) {
        const clientName = user.clientName || (user.clientId ? clientById.get(user.clientId)?.name : undefined);
        addResult({
          id: user.id,
          type: "user",
          title: nameValue || user.email,
          subtitle: [user.role, clientName].filter(Boolean).join(" • ") || undefined,
          clientId: user.clientId ?? null
        });
      }
    });

    return results.slice(0, 20);
  }, [
    normalizedSearchQuery,
    clients,
    projects,
    challenges,
    asks,
    users,
    clientById,
    projectById,
    challengeById
  ]);

  // Enhanced search with vector search option
  const enhancedSearchResults = useMemo(() => {
    const allResults: SearchResultItem[] = [...searchResults];
    
    // Add vector search results if enabled
    if (useVectorSearch && vectorSearchResults.length > 0) {
      for (const vectorResult of vectorSearchResults) {
        if (vectorResult.type === "insight") {
          // Try to find matching insight in existing data or add as new result
          const exists = allResults.some(r => r.id === vectorResult.id);
          if (!exists) {
            allResults.push({
              id: vectorResult.id,
              type: "challenge", // Map to closest type available
              title: `Insight ${vectorResult.id.substring(0, 8)}`,
              subtitle: `Similarité: ${vectorResult.score ? (vectorResult.score * 100).toFixed(0) : 'N/A'}% • ${vectorResult.method}`,
            });
          }
        }
      }
    }
    
    // Remove duplicates and limit
    const unique = Array.from(new Map(allResults.map(r => [`${r.type}-${r.id}`, r])).values());
    return unique.slice(0, 20);
  }, [searchResults, vectorSearchResults, useVectorSearch]);

  const hasSearchResults = enhancedSearchResults.length > 0;
  const showSearchDropdown = isSearchFocused && (normalizedSearchQuery.length > 0 || (useVectorSearch && vectorSearchResults.length > 0));

  const scrollToSection = useCallback(
    (targetId: SectionId) => {
      const navItem = navigationItems.find(item => item.targetId === targetId);
      if (navItem) {
        setActiveSection(navItem.label);
      }
      const ref = sectionRefMap[targetId];
      if (ref?.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [sectionRefMap]
  );

  const handleSearchSelect = useCallback(
    (result: SearchResultItem) => {
      if (searchBlurTimeoutRef.current) {
        clearTimeout(searchBlurTimeoutRef.current);
        searchBlurTimeoutRef.current = null;
      }

      if (result.clientId) {
        setSelectedClientId(result.clientId);
      } else if (result.type === "client") {
        setSelectedClientId(result.id);
      }

      if (result.projectId) {
        setSelectedProjectId(result.projectId);
      } else if (result.type === "project") {
        setSelectedProjectId(result.id);
      }

      if (result.challengeId) {
        setSelectedChallengeId(result.challengeId);
      } else if (result.type === "challenge") {
        setSelectedChallengeId(result.id);
      }

      if (result.type === "ask") {
        setAskDetailId(result.id);
        if (result.challengeId) {
          setSelectedChallengeId(result.challengeId);
        }
      } else {
        setAskDetailId(null);
      }

      if (result.type === "challenge") {
        setChallengeDetailId(result.id);
      } else {
        setChallengeDetailId(null);
      }

      setShowClientForm(false);
      setShowProjectForm(false);
      setShowAskForm(false);
      setShowUserForm(false);

      switch (result.type) {
        case "client":
          scrollToSection("section-clients");
          break;
        case "project":
          scrollToSection("section-projects");
          break;
        case "challenge":
          scrollToSection("section-challenges");
          break;
        case "ask":
          scrollToSection("section-asks");
          break;
        case "user":
          scrollToSection("section-users");
          break;
      }

      setSearchQuery("");
      setIsSearchFocused(false);
      searchInputRef.current?.blur();
    },
    [
      scrollToSection,
      setSelectedClientId,
      setSelectedProjectId,
      setSelectedChallengeId,
      setAskDetailId,
      setChallengeDetailId,
      setShowClientForm,
      setShowProjectForm,
      setShowAskForm,
      setShowUserForm
    ]
  );

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  const handleSearchFocus = useCallback(() => {
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }
    setIsSearchFocused(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    searchBlurTimeoutRef.current = setTimeout(() => {
      setIsSearchFocused(false);
    }, 150);
  }, []);

  // Vector search handler
  const performVectorSearch = useCallback(async () => {
    if (!searchQuery.trim() || !useVectorSearch) return;

    setIsVectorSearching(true);
    try {
      const response = await fetch("/api/admin/graph/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          searchType: "graph",
          projectId: selectedProjectId || undefined,
          limit: 10,
          threshold: 0.75,
        }),
      });

      const data: ApiResponse<Array<{ id: string; type: string; score?: number; method: string }>> =
        await response.json();

      if (data.success && data.data) {
        setVectorSearchResults(data.data);
      }
    } catch (error) {
      console.error("Vector search error:", error);
    } finally {
      setIsVectorSearching(false);
    }
  }, [searchQuery, useVectorSearch, selectedProjectId]);

  // Debounced vector search
  useEffect(() => {
    if (!useVectorSearch || !searchQuery.trim()) {
      setVectorSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      performVectorSearch();
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [searchQuery, useVectorSearch, performVectorSearch]);

  const handleSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        if (enhancedSearchResults[0]) {
          event.preventDefault();
          handleSearchSelect(enhancedSearchResults[0]);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setSearchQuery("");
        setIsSearchFocused(false);
        searchInputRef.current?.blur();
      }
    },
    [handleSearchSelect, enhancedSearchResults]
  );

  const handleClearSearch = useCallback(() => {
    if (searchBlurTimeoutRef.current) {
      clearTimeout(searchBlurTimeoutRef.current);
      searchBlurTimeoutRef.current = null;
    }
    setSearchQuery("");
    setIsSearchFocused(true);
    searchInputRef.current?.focus();
  }, []);

  const projectsForClient = useMemo(
    () => projects.filter(project => project.clientId === selectedClientId),
    [projects, selectedClientId]
  );

  useEffect(() => {
    if (projectsForClient.length > 0) {
      if (!selectedProjectId || !projectsForClient.some(project => project.id === selectedProjectId)) {
        setSelectedProjectId(projectsForClient[0].id);
      }
    } else {
      setSelectedProjectId(null);
    }
  }, [projectsForClient, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId && showJourneyBoard) {
      setShowJourneyBoard(false);
    }
  }, [selectedProjectId, showJourneyBoard]);

  useEffect(() => {
    if (!showJourneyBoard) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowJourneyBoard(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showJourneyBoard]);

  const challengesForProject = useMemo(
    () => challenges.filter(challenge => challenge.projectId === selectedProjectId),
    [challenges, selectedProjectId]
  );

  useEffect(() => {
    if (challengesForProject.length > 0) {
      if (!selectedChallengeId || !challengesForProject.some(challenge => challenge.id === selectedChallengeId)) {
        setSelectedChallengeId(challengesForProject[0].id);
      }
    } else {
      setSelectedChallengeId(null);
    }
  }, [challengesForProject, selectedChallengeId]);

  const asksForChallenge = useMemo(
    () => asks.filter(ask => ask.challengeId === selectedChallengeId),
    [asks, selectedChallengeId]
  );

  const nextDueChallenge = useMemo(() => {
    let closest: (typeof challengesForProject)[number] | null = null;
    for (const challenge of challengesForProject) {
      if (!challenge.dueDate) {
        continue;
      }
      const dueTime = new Date(challenge.dueDate).getTime();
      if (Number.isNaN(dueTime)) {
        continue;
      }
      if (!closest) {
        closest = challenge;
        continue;
      }
      const closestTime = closest.dueDate ? new Date(closest.dueDate).getTime() : Number.POSITIVE_INFINITY;
      if (Number.isNaN(closestTime) || dueTime < closestTime) {
        closest = challenge;
      }
    }
    return closest;
  }, [challengesForProject]);

  const selectedClient = useMemo(
    () => clients.find(client => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const isJourneyMode = Boolean(showJourneyBoard && selectedProjectId);

  const selectedChallenge = useMemo(
    () => challenges.find(challenge => challenge.id === selectedChallengeId) ?? null,
    [challenges, selectedChallengeId]
  );

  const activeAskProjectId = useMemo(() => {
    if (editingAskId) {
      const session = asks.find(item => item.id === editingAskId);
      if (session?.projectId) {
        return session.projectId;
      }
    }

    if (selectedChallenge?.projectId) {
      return selectedChallenge.projectId;
    }

    return selectedProjectId;
  }, [editingAskId, asks, selectedChallenge, selectedProjectId]);

  const activeAskClientId = useMemo(() => {
    if (activeAskProjectId) {
      const project = projects.find(item => item.id === activeAskProjectId);
      if (project?.clientId) {
        return project.clientId;
      }
    }

    if (selectedClientId) {
      return selectedClientId;
    }

    return null;
  }, [activeAskProjectId, projects, selectedClientId]);

  const eligibleAskUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      const nameA = (a.fullName || `${a.firstName ?? ""} ${a.lastName ?? ""}` || a.email || "").trim().toLowerCase();
      const nameB = (b.fullName || `${b.firstName ?? ""} ${b.lastName ?? ""}` || b.email || "").trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return sorted.filter(user => {
      if (!user.isActive) {
        return false;
      }

      const normalizedRole = user.role?.toLowerCase?.() ?? "";
      const isGlobal = normalizedRole.includes("admin") || normalizedRole.includes("owner");

      if (!isGlobal) {
        if (activeAskClientId && user.clientId !== activeAskClientId) {
          return false;
        }

        if (activeAskProjectId) {
          const projectIds = user.projectIds ?? [];
          if (!projectIds.includes(activeAskProjectId)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [activeAskClientId, activeAskProjectId, users]);

  const lockedParticipantIds = useMemo(() => {
    const eligibleIds = new Set(eligibleAskUsers.map(user => user.id));
    return selectedParticipants.filter(participantId => !eligibleIds.has(participantId));
  }, [eligibleAskUsers, selectedParticipants]);

  const participantLookup = useMemo(() => {
    const map = new Map<string, { name: string; role?: string | null }>();

    users.forEach(user => {
      const displayName = (user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}` || user.email || "Participant").trim();
      map.set(user.id, { name: displayName, role: user.role });
    });

    asks.forEach(session => {
      session.participants?.forEach(participant => {
        if (!participant.id) {
          return;
        }

        if (!map.has(participant.id)) {
          map.set(participant.id, { name: participant.name, role: participant.role ?? null });
        }
      });
    });

    return map;
  }, [asks, users]);

  const challengeDetail = useMemo(
    () => challenges.find(challenge => challenge.id === challengeDetailId) ?? null,
    [challenges, challengeDetailId]
  );

  const challengeDetailProjectName = useMemo(() => {
    if (!challengeDetail?.projectId) {
      return null;
    }
    return projects.find(project => project.id === challengeDetail.projectId)?.name ?? null;
  }, [projects, challengeDetail]);

  const challengeDetailAskCount = useMemo(() => {
    if (!challengeDetail) {
      return 0;
    }
    return asks.filter(ask => ask.challengeId === challengeDetail.id).length;
  }, [asks, challengeDetail]);

  const askDetail = useMemo(
    () => asks.find(session => session.id === askDetailId) ?? null,
    [asks, askDetailId]
  );

  const askDetailProjectName = useMemo(() => {
    if (!askDetail?.projectId) {
      return null;
    }
    return projects.find(project => project.id === askDetail.projectId)?.name ?? null;
  }, [projects, askDetail]);

  const askDetailChallengeName = useMemo(() => {
    if (!askDetail?.challengeId) {
      return null;
    }
    return challenges.find(challenge => challenge.id === askDetail.challengeId)?.name ?? null;
  }, [challenges, askDetail]);

  const projectContextMissing = useMemo(
    () =>
      showOnlyChallengeWorkspace && Boolean(initialProjectId) && !isLoading && !selectedProject,
    [showOnlyChallengeWorkspace, initialProjectId, isLoading, selectedProject]
  );

  const isEditingClient = Boolean(editingClientId);
  const isEditingProject = Boolean(editingProjectId);
  const isEditingAsk = Boolean(editingAskId);
  const isEditingUser = Boolean(editingUserId);

  useEffect(() => {
    if (!showUserForm || isEditingUser) {
      return;
    }
    const targetClientId = selectedClientId ?? "";
    if (userForm.getValues("clientId") !== targetClientId) {
      userForm.setValue("clientId", targetClientId, { shouldDirty: false });
    }
  }, [selectedClientId, showUserForm, isEditingUser, userForm]);

  useEffect(() => {
    if (!selectedChallenge) {
      challengeForm.reset({
        name: "",
        description: "",
        status: "open",
        priority: "medium",
        category: "",
        assignedTo: "",
        dueDate: ""
      });
      return;
    }

    challengeForm.reset({
      name: selectedChallenge.name,
      description: selectedChallenge.description ?? "",
      status: (selectedChallenge.status as (typeof challengeStatuses)[number]) || "open",
      priority: (selectedChallenge.priority as (typeof challengePriorities)[number]) || "medium",
      category: selectedChallenge.category ?? "",
      assignedTo: selectedChallenge.assignedTo ?? "",
      dueDate: selectedChallenge.dueDate ? selectedChallenge.dueDate.slice(0, 16) : ""
    });
  }, [selectedChallenge, challengeForm]);

  const stats = useMemo(
    () => [
      { label: "Active clients", value: clients.length, icon: Building2 },
      { label: "Projects", value: projects.length, icon: FolderKanban },
      { label: "Challenges", value: challenges.length, icon: Target },
      { label: "ASK sessions", value: asks.length, icon: MessageSquare }
    ],
    [clients.length, projects.length, challenges.length, asks.length]
  );

  const columnTemplate = useMemo(() => {
    if (!isLargeScreen) {
      return undefined;
    }

    const total = columnWidths.reduce((sum, width) => sum + width, 0);

    if (total === 0) {
      return undefined;
    }

    return columnWidths
      .map((width, index) => {
        const fraction = width / total;
        return `minmax(${minColumnWidths[index]}px, ${fraction}fr)`;
      })
      .join(" ");
  }, [columnWidths, isLargeScreen]);

  const handleResizeMove = useCallback((event: MouseEvent) => {
    const index = activeResizeIndexRef.current;
    if (index === null) {
      return;
    }

    const neighborIndex = index + 1;
    if (neighborIndex >= startColumnWidthsRef.current.length) {
      return;
    }

    const delta = event.clientX - resizeStartXRef.current;

    let nextWidth = startColumnWidthsRef.current[index] + delta;
    nextWidth = Math.min(maxColumnWidths[index], Math.max(minColumnWidths[index], nextWidth));

    let neighborWidth =
      startColumnWidthsRef.current[neighborIndex] -
      (nextWidth - startColumnWidthsRef.current[index]);
    neighborWidth = Math.min(
      maxColumnWidths[neighborIndex],
      Math.max(minColumnWidths[neighborIndex], neighborWidth)
    );

    const adjustedDelta = startColumnWidthsRef.current[neighborIndex] - neighborWidth;
    nextWidth = startColumnWidthsRef.current[index] + adjustedDelta;

    const updated = [...startColumnWidthsRef.current] as ColumnWidths;
    updated[index] = Math.round(nextWidth);
    updated[neighborIndex] = Math.round(neighborWidth);
    setColumnWidths(updated as ColumnWidths);
  }, []);

  const handleResizeEnd = useCallback(() => {
    activeResizeIndexRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>, columnIndex: number) => {
      if (!isLargeScreen) {
        return;
      }
      event.preventDefault();
      activeResizeIndexRef.current = columnIndex;
      resizeStartXRef.current = event.clientX;
      startColumnWidthsRef.current = [...columnWidths] as ColumnWidths;
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
    },
    [columnWidths, handleResizeEnd, handleResizeMove, isLargeScreen]
  );

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", handleResizeMove);
      document.removeEventListener("mouseup", handleResizeEnd);
    };
  }, [handleResizeEnd, handleResizeMove]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const matchingItem = navigationMenu.find(item => item.targetId === entry.target.id);
            if (matchingItem) {
              setActiveSection(matchingItem.label);
            }
          }
        });
      },
      { threshold: 0.25, rootMargin: "-120px 0px -55%" }
    );

    const observedElements: Element[] = [];
    Object.entries(sectionRefMap).forEach(([, ref]) => {
      if (ref.current) {
        observer.observe(ref.current);
        observedElements.push(ref.current);
      }
    });

    return () => {
      observedElements.forEach(element => observer.unobserve(element));
      observer.disconnect();
    };
  }, [sectionRefMap, selectedProjectId, selectedChallengeId, navigationMenu]);


  const resetClientForm = () => {
    clientForm.reset(defaultClientFormValues);
    setEditingClientId(null);
  };

  const handleSubmitClient = async (values: ClientFormInput) => {
    if (editingClientId) {
      await updateClient(editingClientId, values);
    } else {
      await createClient(values);
    }
    resetClientForm();
    setShowClientForm(false);
  };

  const startClientEdit = (clientId: string) => {
    const client = clients.find(item => item.id === clientId);
    if (!client) {
      return;
    }
    setShowClientForm(true);
    setEditingClientId(client.id);
    clientForm.reset({
      name: client.name,
      email: client.email ?? "",
      company: client.company ?? "",
      industry: client.industry ?? "",
      status: (client.status as ClientFormInput["status"]) || "active"
    });
  };

  const cancelClientEdit = () => {
    resetClientForm();
    setShowClientForm(false);
  };

  const resetProjectForm = () => {
    projectForm.reset(defaultProjectFormValues);
    setEditingProjectId(null);
  };

  const handleSubmitProject = async (values: ProjectFormInput) => {
    const targetClientId = selectedClientId || selectedProject?.clientId;
    if (!targetClientId) {
      setFeedback({
        type: "error",
        message: "Select a client before creating or updating a project."
      });
      return;
    }

    if (editingProjectId) {
      await updateProject(editingProjectId, { ...values, clientId: targetClientId });
    } else {
      await createProject({ ...values, clientId: targetClientId });
    }

    resetProjectForm();
    setShowProjectForm(false);
  };

  const startProjectEdit = (projectId: string) => {
    const project = projects.find(item => item.id === projectId);
    if (!project) {
      return;
    }
    setShowProjectForm(true);
    setEditingProjectId(project.id);
    projectForm.reset({
      name: project.name,
      description: project.description ?? "",
      startDate: toInputDate(project.startDate),
      endDate: toInputDate(project.endDate),
      status: (project.status as ProjectFormInput["status"]) || "active",
      createdBy: project.createdBy ?? ""
    });
  };

  const cancelProjectEdit = () => {
    resetProjectForm();
    setShowProjectForm(false);
  };

  const handleUpdateChallenge = async (values: ChallengeFormInput) => {
    if (!selectedChallenge) {
      return;
    }
    await updateChallenge(selectedChallenge.id, values);
  };

  const resetAskForm = () => {
    askForm.reset(defaultAskFormValues);
    setEditingAskId(null);
    setManualAskKey(false);
  };

  const toggleAskParticipant = (userId: string) => {
    const current = askForm.getValues("participantIds") ?? [];
    if (current.includes(userId)) {
      const next = current.filter(id => id !== userId);
      askForm.setValue("participantIds", next, { shouldDirty: true });
      if (askForm.getValues("spokespersonId") === userId) {
        askForm.setValue("spokespersonId", "", { shouldDirty: true });
      }
      return;
    }

    // For all conversation modes, allow multiple participants
    askForm.setValue("participantIds", [...current, userId], { shouldDirty: true });
  };

  const handleSubmitAsk = async (values: AskFormInput) => {
    const payload = {
      askKey: values.askKey,
      name: values.name,
      question: values.question,
      description: values.description ?? "",
      startDate: values.startDate,
      endDate: values.endDate,
      status: values.status,
      isAnonymous: values.isAnonymous,
      maxParticipants: values.maxParticipants,
      deliveryMode: values.deliveryMode,
      conversationMode: values.conversationMode,
      participantIds: values.participantIds ?? [],
      participantEmails: values.participantEmails ?? [],
      spokespersonId: values.spokespersonId ?? "",
      spokespersonEmail: values.spokespersonEmail ?? "",
      systemPrompt: values.systemPrompt ?? ""
    };

    if (editingAskId) {
      const { askKey: _askKey, ...updatePayload } = payload;
      await updateAsk(editingAskId, updatePayload);
    } else {
      const projectId = selectedChallenge?.projectId ?? selectedProjectId;

      if (!projectId) {
        setFeedback({
          type: "error",
          message: "Select a project before creating an ASK."
        });
        return;
      }

      await createAsk({
        ...payload,
        projectId,
        challengeId: selectedChallenge?.id ?? ""
      });
    }

    resetAskForm();
    setShowAskForm(false);
  };

  const startAskEdit = (askId: string) => {
    const session = asks.find(item => item.id === askId);
    if (!session) {
      return;
    }
    setShowAskForm(true);
    setEditingAskId(session.id);
    setManualAskKey(true);
    askForm.reset({
      askKey: session.askKey,
      name: session.name,
      question: session.question,
      description: session.description ?? "",
      startDate: toInputDate(session.startDate),
      endDate: toInputDate(session.endDate),
      status: (session.status as AskFormInput["status"]) || "active",
      isAnonymous: session.isAnonymous,
      maxParticipants: session.maxParticipants ?? undefined,
      deliveryMode: session.deliveryMode ?? "digital",
      conversationMode: session.conversationMode ?? "collaborative",
      participantIds: session.participants?.map(participant => participant.id).filter((value): value is string => Boolean(value)) ?? [],
      participantEmails: session.participants?.filter(participant => !participant.id && participant.email).map(participant => participant.email!).filter(Boolean) ?? [],
      spokespersonId: session.participants?.find(participant => participant.isSpokesperson && participant.id)?.id ?? "",
      spokespersonEmail: session.participants?.find(participant => participant.isSpokesperson && participant.email && !participant.id)?.email ?? "",
      systemPrompt: session.systemPrompt ?? ""
    });
  };

  const cancelAskEdit = () => {
    resetAskForm();
    setShowAskForm(false);
  };

  const handleCanvasProjectSelect = (projectId: string) => {
    const project = projects.find(item => item.id === projectId);
    if (!project) {
      return;
    }
    setSelectedClientId(project.clientId ?? null);
    setSelectedProjectId(project.id);
    setActiveSection("Challenges");
  };

  const handleCanvasChallengeSelect = (challengeId: string) => {
    const challenge = challenges.find(item => item.id === challengeId);
    if (!challenge) {
      return;
    }
    if (challenge.projectId) {
      handleCanvasProjectSelect(challenge.projectId);
    }
    setSelectedChallengeId(challenge.id);
    setAskDetailId(null);
    setChallengeDetailId(challenge.id);
    setActiveSection("Challenges");
  };

  const handleCanvasAskSelect = (askId: string) => {
    const session = asks.find(item => item.id === askId);
    if (!session) {
      return;
    }
    if (session.projectId) {
      handleCanvasProjectSelect(session.projectId);
    }
    if (session.challengeId) {
      setSelectedChallengeId(session.challengeId);
    }
    startAskEdit(session.id);
    setChallengeDetailId(null);
    setAskDetailId(session.id);
    setActiveSection("ASK Sessions");
  };

  const resetUserForm = () => {
    userForm.reset({ ...defaultUserFormValues, clientId: selectedClientId ?? "" });
    setEditingUserId(null);
  };

  const handleSubmitUser = async (values: UserFormInput) => {
    // Remove fullName as it's not accepted by the API - it's computed from firstName/lastName
    const { fullName, ...payload } = values;
    if (editingUserId) {
      payload.clientId = values.clientId ?? "";
      await updateUser(editingUserId, payload);
    } else {
      if (!selectedClientId) {
        setFeedback({
          type: "error",
          message: "Select a client before creating a user."
        });
        return;
      }
      payload.clientId = selectedClientId;
      await createUser(payload);
    }
    resetUserForm();
    setEditingUserId(null);
    setShowUserForm(false);
  };

  const startUserEdit = (userId: string) => {
    const user = users.find(item => item.id === userId);
    if (!user) {
      return;
    }
    setShowUserForm(true);
    setEditingUserId(user.id);
    userForm.reset({
      email: user.email,
      fullName: user.fullName ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: (user.role as UserFormInput["role"]) || "participant",
      clientId: user.clientId ?? "",
      isActive: user.isActive,
      jobTitle: user.jobTitle ?? ""
    });
  };

  const handleUserSelectedForProject = async (user: ManagedUser | null) => {
    if (!user || !selectedProjectId) {
      setSelectedUserForProject(null);
      return;
    }

    // User exists, add to project
    await addUserToProject(user.id, selectedProjectId);
    setSelectedUserForProject(null);
    setShowUserForm(false);
  };

  const handleCreateNewUserForProject = async (email: string) => {
    if (!selectedProjectId) {
      console.error("No project selected");
      return;
    }
    console.log("Creating new user for project:", { email, selectedProjectId });
    const clientId = selectedProject?.clientId ?? selectedClientId ?? undefined;
    console.log("Client ID:", clientId);
    const newUser = await createUserAndAddToProject(email, selectedProjectId, clientId);
    if (newUser) {
      console.log("User created successfully, selecting:", newUser);
      // Select the newly created user - it should now be in the refreshed users list
      setSelectedUserForProject(newUser);
      setShowUserForm(false);
    } else {
      console.error("Failed to create user");
    }
  };

  const cancelUserEdit = () => {
    resetUserForm();
    setSelectedUserForProject(null);
    setEditingUserId(null);
    setShowUserForm(false);
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm("Delete this user?")) {
      return;
    }
    await deleteUser(userId);
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!window.confirm("Delete this client and all related items?")) {
      return;
    }
    if (selectedClientId === clientId) {
      setSelectedClientId(null);
      setSelectedProjectId(null);
      setSelectedChallengeId(null);
    }
    await deleteClient(clientId);
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!window.confirm("Delete this project and its related challenges?")) {
      return;
    }
    if (selectedProjectId === projectId) {
      setSelectedProjectId(null);
      setSelectedChallengeId(null);
    }
    await deleteProject(projectId);
  };

  const handleDeleteChallenge = async (challengeId: string) => {
    if (!window.confirm("Delete this challenge?")) {
      return;
    }
    if (selectedChallengeId === challengeId) {
      setSelectedChallengeId(null);
    }
    await deleteChallenge(challengeId);
  };

  const handleDeleteAsk = async (askId: string) => {
    if (!window.confirm("Delete this ASK session?")) {
      return;
    }
    await deleteAsk(askId);
  };

  const handleAddUserToProject = async (userId: string) => {
    if (!selectedProjectId) {
      return;
    }
    await addUserToProject(userId, selectedProjectId);
  };

  const handleRemoveUserFromProject = async (userId: string) => {
    if (!selectedProjectId) {
      return;
    }
    await removeUserFromProject(userId, selectedProjectId);
  };

  const filteredUsers = useMemo(() => {
    const projectClientId = selectedProject?.clientId ?? null;
    const targetClientId = selectedClientId ?? projectClientId ?? null;

    // If a project is selected, only show users who are members of that project
    if (selectedProjectId) {
      return users.filter(user => {
        const userProjectIds = user.projectIds ?? [];
        return userProjectIds.includes(selectedProjectId);
      }).sort((a, b) => {
        const aLabel = (a.fullName || a.email || "").toLowerCase();
        const bLabel = (b.fullName || b.email || "").toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
    }

    // When no project is selected, show all users (original behavior)
    const filtered = users.filter(user => {
      const normalizedRole = user.role?.toLowerCase?.() ?? "";
      const isGlobal = normalizedRole.includes("admin") || normalizedRole.includes("owner");
      const userProjectIds = user.projectIds ?? [];

      if (targetClientId && user.clientId === targetClientId) {
        return true;
      }

      if (isGlobal) {
        return true;
      }

      if (!targetClientId) {
        return true;
      }

      return false;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aProjects = a.projectIds ?? [];
      const bProjects = b.projectIds ?? [];

      const aMemberPriority = selectedProjectId ? (aProjects.includes(selectedProjectId) ? 0 : 1) : 0;
      const bMemberPriority = selectedProjectId ? (bProjects.includes(selectedProjectId) ? 0 : 1) : 0;
      if (aMemberPriority !== bMemberPriority) {
        return aMemberPriority - bMemberPriority;
      }

      const aClientPriority = targetClientId ? (a.clientId === targetClientId ? 0 : 1) : 0;
      const bClientPriority = targetClientId ? (b.clientId === targetClientId ? 0 : 1) : 0;
      if (aClientPriority !== bClientPriority) {
        return aClientPriority - bClientPriority;
      }

      const aIsGlobal = (a.role?.toLowerCase?.() ?? "").includes("admin") || (a.role?.toLowerCase?.() ?? "").includes("owner");
      const bIsGlobal = (b.role?.toLowerCase?.() ?? "").includes("admin") || (b.role?.toLowerCase?.() ?? "").includes("owner");
      if (aIsGlobal !== bIsGlobal) {
        return aIsGlobal ? -1 : 1;
      }

      const aLabel = (a.fullName || a.email || "").toLowerCase();
      const bLabel = (b.fullName || b.email || "").toLowerCase();
      return aLabel.localeCompare(bLabel);
    });

    return sorted;
  }, [users, selectedClientId, selectedProjectId, selectedProject]);

  // Stabilize profile values to avoid unnecessary re-renders
  const profileRole = profile?.role ?? user?.profile?.role ?? user?.role ?? "";
  const profileIsActive = profile?.isActive ?? user?.profile?.isActive ?? true;
  const hasProfile = !!profile || !!user?.profile;

  const normalizedRole = useMemo(() => {
    return profileRole.toLowerCase();
  }, [profileRole]);

  // Note: Auth protection is now handled by AdminAuthGuard in AdminPageLayout
  // This component assumes it's rendered only when auth is valid

  // Filter users based on role for search
  // Use profile.id and profile.role instead of profile object to avoid unnecessary recalculations
  const profileRoleLower = normalizedRole; // Use normalizedRole which is already lowercase
  const profileClientId = profile?.clientId ?? user?.profile?.clientId ?? null;
  
  const availableUsersForSearch = useMemo(() => {
    if (!profile && !user?.profile) {
      return [];
    }
    
    // Full admins see all users
    if (profileRoleLower === "full_admin") {
      return users;
    }
    
    // Project admins, facilitators, managers see only users from their client
    if (["project_admin", "facilitator", "manager"].includes(profileRoleLower)) {
      if (!profileClientId) return [];
      return users.filter(user => user.clientId === profileClientId);
    }
    
    return [];
  }, [users, profileRoleLower, profileClientId]);

  // All hooks must be called before any conditional returns
  // Calculate values that depend on filteredUsers and other data
  const viewingClientId = selectedClientId ?? selectedProject?.clientId ?? null;
  const activeUserCount = useMemo(
    () => filteredUsers.filter(user => user.isActive).length,
    [filteredUsers]
  );
  const inactiveUserCount = filteredUsers.length - activeUserCount;

  // Update the context with AdminDashboard's search state
  // This must be called before any conditional returns to maintain hook order
  // Memoize the context value to avoid infinite loops
  const searchContextValue = useMemo(() => ({
    searchQuery,
    setSearchQuery,
    isSearchFocused,
    setIsSearchFocused,
    useVectorSearch,
    setUseVectorSearch,
    isVectorSearching,
    enhancedSearchResults,
    hasSearchResults,
    showSearchDropdown,
    searchInputRef,
    searchResultTypeConfig,
    handleSearchChange,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchKeyDown,
    handleClearSearch,
    handleSearchSelect,
  }), [
    searchQuery,
    isSearchFocused,
    useVectorSearch,
    isVectorSearching,
    enhancedSearchResults,
    hasSearchResults,
    showSearchDropdown,
    searchResultTypeConfig,
    handleSearchChange,
    handleSearchFocus,
    handleSearchBlur,
    handleSearchKeyDown,
    handleClearSearch,
    handleSearchSelect,
  ]);

  useEffect(() => {
    if (searchContext?.updateContext) {
      searchContext.updateContext(searchContextValue);
    }
  }, [searchContext, searchContextValue]);

  // Auth protection is handled by AdminAuthGuard - render dashboard content directly
  const renderChallengeWorkspace = () => (
    <div
      ref={challengesRef}
      id="section-challenges"
      className={`flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur ${
        showOnlyChallengeWorkspace ? "xl:mx-auto xl:max-w-6xl xl:p-6 2xl:max-w-7xl" : ""
      }`}
    >
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-white">Challenges & ASK sessions</h3>
      </header>


      <div className="space-y-6">
        {projectContextMissing && (
          <Alert className="border-red-500/40 bg-red-500/10 text-red-100">
            <AlertDescription>
              Ce projet n'existe plus ou n'est pas accessible. Sélectionnez un autre projet dans la carte.
            </AlertDescription>
          </Alert>
        )}
        <AskRelationshipCanvas
          projects={projects}
          challenges={challenges}
          asks={asks}
          focusProjectId={selectedProjectId}
          focusChallengeId={selectedChallengeId}
          focusAskId={editingAskId}
          onProjectSelect={handleCanvasProjectSelect}
          onChallengeSelect={handleCanvasChallengeSelect}
          onAskSelect={handleCanvasAskSelect}
        />
        {selectedProject ? (
          <div
            className={`grid gap-4 ${
              showOnlyChallengeWorkspace
                ? "xl:grid-cols-[minmax(260px,0.85fr)_minmax(360px,1.15fr)]"
                : "xl:grid-cols-[minmax(240px,0.9fr)_minmax(260px,1.1fr)]"
            }`}
          >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Challenges</h4>
              <span className="text-xs text-slate-400">
                {challengesForProject.length} total
              </span>
            </div>
            <div className="space-y-2 overflow-y-auto pr-2">
              {challengesForProject.length === 0 ? (
                <p className="text-sm text-slate-400">No challenges captured yet.</p>
              ) : (
                challengesForProject.map(challenge => (
                  <article
                    key={challenge.id}
                    className={`rounded-2xl border px-4 py-3 transition hover:border-indigo-400 ${
                      challenge.id === selectedChallengeId
                        ? "border-indigo-400 bg-indigo-500/10"
                        : "border-white/10 bg-slate-900/40"
                    }`}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3"
                      onClick={() => setSelectedChallengeId(challenge.id)}
                    >
                      <div className="text-left">
                        <h5 className="text-sm font-semibold text-white">{challenge.name}</h5>
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {challenge.description || "No description"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-wide text-slate-300">
                        <span>{challenge.status}</span>
                        {challenge.priority && <span className="text-red-300">{challenge.priority}</span>}
                      </div>
                    </button>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>{asks.filter(ask => ask.challengeId === challenge.id).length} ASK sessions</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteChallenge(challenge.id)}
                        className="text-red-300 hover:text-red-200"
                        disabled={isBusy}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div
            ref={asksRef}
            id="section-asks"
            className="space-y-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
          >
            {selectedChallenge ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-semibold text-white">{selectedChallenge.name}</h4>
                    <p className="text-xs text-slate-400">
                      Last update {formatDateTime(selectedChallenge.updatedAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                    {selectedChallenge.status}
                  </span>
                </div>

                <form onSubmit={challengeForm.handleSubmit(handleUpdateChallenge)} className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <Label htmlFor="challenge-name">Name</Label>
                    <Input id="challenge-name" placeholder="Update the challenge name" {...challengeForm.register("name")} disabled={isBusy} />
                  </div>
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <Label htmlFor="challenge-description">Description</Label>
                    <Textarea
                      id="challenge-description"
                      rows={3}
                      placeholder="Provide a concise description"
                      {...challengeForm.register("description")}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="challenge-status">Status</Label>
                    <select
                      id="challenge-status"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...challengeForm.register("status")}
                      disabled={isBusy}
                    >
                      {challengeStatuses.map(status => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="challenge-priority">Priority</Label>
                    <select
                      id="challenge-priority"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...challengeForm.register("priority")}
                      disabled={isBusy}
                    >
                      {challengePriorities.map(priority => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="challenge-category">Category</Label>
                    <Input
                      id="challenge-category"
                      placeholder="Operational, Culture, Experience..."
                      {...challengeForm.register("category")}
                      disabled={isBusy}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="challenge-owner">Assignee</Label>
                    <select
                      id="challenge-owner"
                      className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                      {...challengeForm.register("assignedTo")}
                      disabled={isBusy}
                    >
                      <option value="">Unassigned</option>
                      {filteredUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.fullName || user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="challenge-due">Due date</Label>
                    <Controller
                      control={challengeForm.control}
                      name="dueDate"
                      render={({ field }) => (
                        <DateTimePicker
                          id="challenge-due"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isBusy}
                          placeholder="Select due date"
                        />
                      )}
                    />
                  </div>
                  <div className="md:col-span-2 flex justify-end">
                    <Button type="submit" className="px-4" disabled={isBusy}>
                      Update challenge
                    </Button>
                  </div>
                </form>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-sm font-semibold text-slate-200">ASK sessions</h5>
                    <Button
                      type="button"
                      className={`${gradientButtonClasses} h-9 px-3 text-xs`}
                      onClick={() => {
                        if (showAskForm) {
                          cancelAskEdit();
                        } else {
                          resetAskForm();
                          setShowAskForm(true);
                        }
                      }}
                      disabled={isBusy}
                    >
                      {showAskForm ? "Close" : "Create ASK"}
                    </Button>
                  </div>

                  {showAskForm && (
                    <form onSubmit={askForm.handleSubmit(handleSubmitAsk)} className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                      {isEditingAsk && (
                        <p className="text-xs font-medium text-amber-300">
                          Editing {asks.find(ask => ask.id === editingAskId)?.name}
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ask-name">Name</Label>
                        <Input
                          id="ask-name"
                          placeholder="Session name"
                          {...askForm.register("name")}
                          disabled={isBusy}
                        />
                        {askForm.formState.errors.name && (
                          <p className="text-xs text-red-400">{askForm.formState.errors.name.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ask-key">ASK key</Label>
                        <div className="flex gap-2">
                          <Input
                            id="ask-key"
                            placeholder="Auto generated"
                            {...askForm.register("askKey", {
                              onChange: () => setManualAskKey(true)
                            })}
                            disabled={isBusy || isEditingAsk}
                          />
                          <Button
                            type="button"
                            variant="glassDark"
                            onClick={() => {
                              const name = askForm.getValues("name");
                              askForm.setValue("askKey", generateAskKey(name || "ask"));
                              setManualAskKey(false);
                            }}
                            disabled={isBusy || isEditingAsk}
                          >
                            Regenerate
                          </Button>
                        </div>
                        {askForm.formState.errors.askKey && (
                          <p className="text-xs text-red-400">{askForm.formState.errors.askKey.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ask-question">Guiding question</Label>
                        <Textarea
                          id="ask-question"
                          rows={3}
                          placeholder="What do you want the team to explore?"
                          {...askForm.register("question")}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ask-description">Description</Label>
                        <Textarea
                          id="ask-description"
                          rows={2}
                          placeholder="Share additional context"
                          {...askForm.register("description")}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <AskPromptTemplateSelector
                          value={askForm.watch("systemPrompt") || ""}
                          onChange={(value) => askForm.setValue("systemPrompt", value, { shouldDirty: true })}
                          disabled={isBusy}
                        />
                        <Label htmlFor="ask-system-prompt">System prompt</Label>
                        <Textarea
                          id="ask-system-prompt"
                          rows={6}
                          placeholder="Provide the system prompt used by the AI for this ask"
                          {...askForm.register("systemPrompt")}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="ask-start">Start</Label>
                          <Controller
                            control={askForm.control}
                            name="startDate"
                            render={({ field }) => (
                              <DateTimePicker
                                id="ask-start"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={isBusy}
                                placeholder="Select start date"
                              />
                            )}
                          />
                          {askForm.formState.errors.startDate && (
                            <p className="text-xs text-red-400">{askForm.formState.errors.startDate.message}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="ask-end">End</Label>
                          <Controller
                            control={askForm.control}
                            name="endDate"
                            render={({ field }) => (
                              <DateTimePicker
                                id="ask-end"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={isBusy}
                                placeholder="Select end date"
                              />
                            )}
                          />
                          {askForm.formState.errors.endDate && (
                            <p className="text-xs text-red-400">{askForm.formState.errors.endDate.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="ask-status">Status</Label>
                          <select
                            id="ask-status"
                            className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                            {...askForm.register("status")}
                            disabled={isBusy}
                          >
                            {askStatuses.map(status => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-white/20 bg-slate-900"
                            {...askForm.register("isAnonymous")}
                            disabled={isBusy}
                          />
                          Allow anonymous participation
                        </label>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="ask-delivery">Delivery mode</Label>
                          <select
                            id="ask-delivery"
                            className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                            {...askForm.register("deliveryMode")}
                            disabled={isBusy}
                          >
                            {deliveryModes.map(mode => (
                              <option key={mode} value={mode}>
                                {mode === "physical" ? "In-person" : "Digital"}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="ask-conversation-mode">Conversation Mode</Label>
                          <select
                            id="ask-conversation-mode"
                            className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                            {...askForm.register("conversationMode")}
                            disabled={isBusy}
                          >
                            <option value="individual_parallel">Individual parallel responses</option>
                            <option value="collaborative">Multi-voice conversation</option>
                            <option value="group_reporter">Group with reporter</option>
                          </select>
                          <p className="text-xs text-slate-400">
                            {selectedConversationMode === "individual_parallel" && "Each person responds separately, no cross-visibility"}
                            {selectedConversationMode === "collaborative" && "Everyone sees and can respond to each other"}
                            {selectedConversationMode === "group_reporter" && "Everyone sees everything, one reporter consolidates"}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Participants</Label>
                        <p className="text-xs text-slate-400">
                          Toggle the contacts who can be invited to this ASK. Admin roles stay available across all projects.
                        </p>

                        {lockedParticipantIds.length > 0 && (
                          <div className="rounded-md border border-amber-300/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                            <p className="font-semibold text-amber-200">Participants currently outside the project scope</p>
                            <ul className="mt-2 space-y-1">
                              {lockedParticipantIds.map(participantId => {
                                const info = participantLookup.get(participantId);
                                return (
                                  <li key={participantId} className="flex items-center justify-between gap-3">
                                    <span>{info?.name ?? participantId}</span>
                                    {info?.role && (
                                      <span className="text-[10px] uppercase tracking-wide text-amber-300">{info.role}</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/40 p-3">
                          {eligibleAskUsers.length === 0 ? (
                            <p className="text-sm text-slate-400">No eligible contacts for this project.</p>
                          ) : (
                            eligibleAskUsers.map(user => {
                              const isChecked = selectedParticipants.includes(user.id);
                              const displayName =
                                user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email || "Participant";

                              return (
                                <label
                                  key={user.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-200"
                                >
                                  <div>
                                    <p className="font-medium text-white">{displayName}</p>
                                    <p className="text-xs text-slate-400">{user.role}</p>
                                  </div>
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-white/20 bg-slate-900"
                                    checked={isChecked}
                                    onChange={() => toggleAskParticipant(user.id)}
                                    disabled={isBusy}
                                  />
                                </label>
                              );
                            })
                          )}
                        </div>

                        <div className="space-y-2 rounded-xl border border-white/10 bg-slate-900/40 p-3">
                          <Label className="text-sm">Add participants by email</Label>
                          <p className="text-xs text-slate-400">
                            Add email addresses to invite participants who don't have accounts yet. They will receive a magic link to join.
                          </p>
                          <div className="flex gap-2">
                            <Input
                              type="email"
                              placeholder="participant@example.com"
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && emailInput.trim()) {
                                  e.preventDefault();
                                  const email = emailInput.trim().toLowerCase();
                                  if (email && !participantEmails.includes(email)) {
                                    const current = askForm.getValues("participantEmails") ?? [];
                                    askForm.setValue("participantEmails", [...current, email], { shouldDirty: true });
                                    setEmailInput("");
                                  }
                                }
                              }}
                              disabled={isBusy}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="glassDark"
                              onClick={() => {
                                if (emailInput.trim()) {
                                  const email = emailInput.trim().toLowerCase();
                                  if (email && !participantEmails.includes(email)) {
                                    const current = askForm.getValues("participantEmails") ?? [];
                                    askForm.setValue("participantEmails", [...current, email], { shouldDirty: true });
                                    setEmailInput("");
                                  }
                                }
                              }}
                              disabled={isBusy || !emailInput.trim()}
                            >
                              Add
                            </Button>
                          </div>
                          {participantEmails.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {participantEmails.map((email, index) => (
                                <span
                                  key={index}
                                  className="flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs text-indigo-200"
                                >
                                  {email}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const current = askForm.getValues("participantEmails") ?? [];
                                      askForm.setValue(
                                        "participantEmails",
                                        current.filter((e) => e !== email),
                                        { shouldDirty: true }
                                      );
                                    }}
                                    disabled={isBusy}
                                    className="text-indigo-300 hover:text-indigo-100"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {selectedConversationMode === "group_reporter" && (selectedParticipants.length > 0 || participantEmails.length > 0) && (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="ask-spokesperson">Reporter</Label>
                          <select
                            id="ask-spokesperson"
                            className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                            {...askForm.register("spokespersonId")}
                            disabled={isBusy}
                          >
                            <option value="">No dedicated spokesperson</option>
                            {selectedParticipants.map(participantId => {
                              const info = participantLookup.get(participantId);
                              return (
                                <option key={participantId} value={participantId}>
                                  {info?.name ?? participantId}
                                </option>
                              );
                            })}
                          </select>
                          {participantEmails.length > 0 && (
                            <select
                              id="ask-spokesperson-email"
                              className="mt-2 h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                              {...askForm.register("spokespersonEmail")}
                              disabled={isBusy}
                            >
                              <option value="">No email spokesperson</option>
                              {participantEmails.map(email => (
                                <option key={email} value={email}>
                                  {email}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col gap-2">
                        <Label htmlFor="ask-max">Max participants</Label>
                        <Input
                          id="ask-max"
                          type="number"
                          min={1}
                          placeholder="e.g. 50"
                          {...askForm.register("maxParticipants", { valueAsNumber: true })}
                          disabled={isBusy}
                        />
                      </div>

                      {/* Participant Invite Links - Only show when editing existing ASK */}
                      {isEditingAsk && editingAskId && (
                        <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-sm font-semibold text-indigo-200">Participant Invite Links</Label>
                              <p className="text-xs text-slate-400 mt-1">
                                Copy individual links or send invites via email
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="glassDark"
                              size="sm"
                              onClick={async () => {
                                if (!editingAskId) return;
                                setIsSendingInvites(true);
                                try {
                                  const response = await fetch(`/api/admin/asks/${editingAskId}/send-invites`, {
                                    method: "POST",
                                  });
                                  const data = await response.json();
                                  if (data.success) {
                                    setFeedback({
                                      type: "success",
                                      message: `Sent ${data.data.sent} invite${data.data.sent !== 1 ? "s" : ""}${data.data.failed > 0 ? `, ${data.data.failed} failed` : ""}`
                                    });
                                  } else {
                                    setFeedback({
                                      type: "error",
                                      message: data.error || "Failed to send invites"
                                    });
                                  }
                                } catch (error) {
                                  setFeedback({
                                    type: "error",
                                    message: "Failed to send invites"
                                  });
                                } finally {
                                  setIsSendingInvites(false);
                                }
                              }}
                              disabled={isSendingInvites}
                              className="h-8 px-3 text-xs bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-400/30"
                            >
                              <Mail className="h-3 w-3 mr-2" />
                              Send Invites
                            </Button>
                          </div>
                          
                          {/* Participants with links */}
                          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                            {/* Use existing ASK participants with their tokens when editing */}
                            {(() => {
                              const currentAsk = editingAskId ? asks.find(a => a.id === editingAskId) : null;
                              const existingParticipants = currentAsk?.participants || [];
                              
                              // Generate magic link URL helper
                              const generateMagicLinkUrl = (email: string, askKey: string, participantToken?: string | null): string => {
                                const baseUrl = typeof window !== "undefined" 
                                  ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
                                  : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                                
                                // If we have a participant token, use it for a unique link per participant
                                if (participantToken) {
                                  return `${baseUrl}/?token=${participantToken}`;
                                }
                                
                                // Otherwise, use the askKey (backward compatible)
                                return `${baseUrl}/?key=${askKey}`;
                              };
                              
                              if (existingParticipants.length > 0) {
                                return existingParticipants.map(participant => {
                                  const participantEmail = participant.email;
                                  const askKey = askForm.watch("askKey");
                                  const magicLink = participantEmail 
                                    ? generateMagicLinkUrl(participantEmail, askKey, participant.inviteToken) 
                                    : (participant.inviteToken ? generateMagicLinkUrl("", askKey, participant.inviteToken) : (askKey ? generateMagicLinkUrl("", askKey) : null));
                                  const participantKey = participant.id || participant.email || `participant-${Math.random()}`;
                                  const isCopied = copiedLinks.has(participantKey);
                                  
                                  return (
                                    <div key={participantKey} className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
                                      <div className="flex items-center justify-between mb-1">
                                        <div>
                                          <p className="text-sm font-medium text-white">{participant.name}</p>
                                          {participantEmail && <p className="text-xs text-slate-400">{participantEmail}</p>}
                                          {!participantEmail && <p className="text-xs text-slate-400">No email on record</p>}
                                        </div>
                                      </div>
                                      {magicLink && (
                                        <div className="flex items-center gap-2 mt-2">
                                          <input
                                            type="text"
                                            readOnly
                                            value={magicLink}
                                            className="flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 font-mono"
                                            onClick={(e) => (e.target as HTMLInputElement).select()}
                                          />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              navigator.clipboard.writeText(magicLink);
                                              setCopiedLinks(prev => new Set([...prev, participantKey]));
                                              setTimeout(() => {
                                                setCopiedLinks(prev => {
                                                  const next = new Set(prev);
                                                  next.delete(participantKey);
                                                  return next;
                                                });
                                              }, 2000);
                                            }}
                                            className="rounded-lg border border-white/10 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"
                                            title="Copy link"
                                          >
                                            {isCopied ? (
                                              <Check className="h-3 w-3 text-green-400" />
                                            ) : (
                                              <Copy className="h-3 w-3" />
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                });
                              }
                              
                              // Fallback to form participants if no existing participants found
                              return (
                                <>
                                  {/* Participants from user IDs */}
                                  {selectedParticipants.length > 0 && selectedParticipants.map(participantId => {
                                    const user = eligibleAskUsers.find(u => u.id === participantId);
                                    if (!user) return null;
                                    const email = user.email;
                                    const askKey = askForm.watch("askKey");
                                    // Note: For new participants being added, we don't have invite_token yet
                                    // It will be generated when they're saved to the database
                                    const baseUrl = typeof window !== "undefined" 
                                      ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
                                      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                                    const magicLink = askKey 
                                      ? `${baseUrl}/?key=${askKey}`
                                      : null;
                                    const isCopied = copiedLinks.has(participantId);
                                    
                                    return (
                                      <div key={participantId} className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <div>
                                            <p className="text-sm font-medium text-white">
                                              {user.fullName || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email}
                                            </p>
                                            {email && <p className="text-xs text-slate-400">{email}</p>}
                                          </div>
                                        </div>
                                        {magicLink && (
                                          <div className="flex items-center gap-2 mt-2">
                                            <input
                                              type="text"
                                              readOnly
                                              value={magicLink}
                                              className="flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 font-mono"
                                              onClick={(e) => (e.target as HTMLInputElement).select()}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                navigator.clipboard.writeText(magicLink);
                                                setCopiedLinks(prev => new Set([...prev, participantId]));
                                                setTimeout(() => {
                                                  setCopiedLinks(prev => {
                                                    const next = new Set(prev);
                                                    next.delete(participantId);
                                                    return next;
                                                  });
                                                }, 2000);
                                              }}
                                              className="rounded-lg border border-white/10 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"
                                              title="Copy link"
                                            >
                                              {isCopied ? (
                                                <Check className="h-3 w-3 text-green-400" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  
                                  {/* Participants from emails */}
                                  {participantEmails.length > 0 && participantEmails.map((email, index) => {
                                    const askKey = askForm.watch("askKey");
                                    // Note: For new email participants being added, we don't have invite_token yet
                                    // It will be generated when they're saved to the database
                                    const baseUrl = typeof window !== "undefined" 
                                      ? (process.env.NEXT_PUBLIC_APP_URL || window.location.origin)
                                      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                                    const magicLink = askKey 
                                      ? `${baseUrl}/?key=${askKey}`
                                      : null;
                                    const emailKey = `email-${index}`;
                                    const isCopied = copiedLinks.has(emailKey);
                                    
                                    return (
                                      <div key={emailKey} className="rounded-lg border border-white/10 bg-slate-900/60 p-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <div>
                                            <p className="text-sm font-medium text-white">{email}</p>
                                            <p className="text-xs text-slate-400">Email participant</p>
                                          </div>
                                        </div>
                                        {magicLink && (
                                          <div className="flex items-center gap-2 mt-2">
                                            <input
                                              type="text"
                                              readOnly
                                              value={magicLink}
                                              className="flex-1 rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1 text-xs text-slate-200 font-mono"
                                              onClick={(e) => (e.target as HTMLInputElement).select()}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                navigator.clipboard.writeText(magicLink);
                                                setCopiedLinks(prev => new Set([...prev, emailKey]));
                                                setTimeout(() => {
                                                  setCopiedLinks(prev => {
                                                    const next = new Set(prev);
                                                    next.delete(emailKey);
                                                    return next;
                                                  });
                                                }, 2000);
                                              }}
                                              className="rounded-lg border border-white/10 bg-slate-900/60 p-1.5 text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors"
                                              title="Copy link"
                                            >
                                              {isCopied ? (
                                                <Check className="h-3 w-3 text-green-400" />
                                              ) : (
                                                <Copy className="h-3 w-3" />
                                              )}
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  
                                  {selectedParticipants.length === 0 && participantEmails.length === 0 && (
                                    <p className="text-xs text-slate-400 text-center py-2">No participants selected yet</p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        {isEditingAsk && (
                          <Button
                            type="button"
                            variant="glassDark"
                            onClick={cancelAskEdit}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button type="submit" className="px-4" disabled={isBusy}>
                          {isEditingAsk ? "Update ASK" : "Launch ASK"}
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-2">
                    {asksForChallenge.length === 0 ? (
                      <p className="text-sm text-slate-400">No ASK sessions have been created yet.</p>
                    ) : (
                      asksForChallenge.map(session => (
                        <div
                          key={session.id}
                          className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-slate-200"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-white">{session.name}</p>
                              <p className="text-xs text-slate-400">Key: {session.askKey}</p>
                            </div>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                              {session.status}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-400">
                            {formatDateTime(session.startDate)} → {formatDateTime(session.endDate)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-slate-300">
                            <span className="rounded-full bg-white/10 px-2 py-1">
                              {session.deliveryMode === "physical" ? "In-person" : "Digital"}
                            </span>
                            <span className="rounded-full bg-white/10 px-2 py-1">
                              {session.audienceScope === "individual" ? "Individual" : "Group"}
                            </span>
                            {session.audienceScope === "group" && (
                              <span className="rounded-full bg-white/10 px-2 py-1">
                                {session.responseMode === "collective" ? "Spokesperson" : "Simultaneous"}
                              </span>
                            )}
                          </div>
                          <div className="mt-3 space-y-1 text-xs text-slate-300">
                            <p className="text-slate-200">
                              {(session.participants?.length ?? 0)} participant{session.participants && session.participants.length === 1 ? "" : "s"}
                              {session.audienceScope === "group" && session.participants?.some(part => part.isSpokesperson)
                                ? " • spokesperson assigned"
                                : ""}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {session.isAnonymous ? "Anonymous answers enabled" : "Identified participants"}
                            </p>
                            {session.participants && session.participants.length > 0 && (
                              <p className="text-[11px] text-slate-400">
                                {session.participants
                                  .map(participant => `${participant.name}${participant.isSpokesperson ? " (spokesperson)" : ""}`)
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                            <span>
                              {session.maxParticipants ? `Max ${session.maxParticipants}` : "No participant cap"}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startAskEdit(session.id)}
                                className="text-slate-200 hover:text-white"
                                disabled={isBusy}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAsk(session.id)}
                                className="text-red-300 hover:text-red-200"
                                disabled={isBusy}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-400">Select a challenge to review its details.</p>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={asksRef}
          id="section-asks"
          className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-6 text-sm text-slate-400"
        >
          Pick a project to access its challenges.
        </div>
      )}
      </div>
    </div>
  );

  return (
    <>
      <ChallengeDetailDialog
        challenge={challengeDetail}
        projectName={challengeDetailProjectName}
        askCount={challengeDetailAskCount}
        onClose={() => setChallengeDetailId(null)}
      />
      <AskDetailDialog
        ask={askDetail}
        projectName={askDetailProjectName}
        challengeName={askDetailChallengeName}
        onClose={() => setAskDetailId(null)}
      />
      <div className="h-screen bg-slate-950 text-slate-100">
      <div className="flex h-full">
        <div className="flex flex-1 flex-col">
          <main
            ref={mainScrollRef}
            className={`flex-1 overflow-y-auto ${
              isJourneyMode
                ? "space-y-6 px-4 py-6 sm:px-6 lg:px-10"
                : showOnlyChallengeWorkspace
                  ? "space-y-6 px-6 py-6 lg:px-10"
                  : "space-y-8 px-6 pt-8 pb-0"
            }`}
          >
            {feedback && (
              <Alert
                variant={feedback.type === "error" ? "destructive" : "default"}
                className={
                  feedback.type === "error"
                    ? "border-red-500/40 bg-red-500/20 backdrop-blur-sm text-red-50 shadow-lg"
                    : "border-white/10 bg-white/5 text-foreground"
                }
              >
                <div className="flex w-full items-start justify-between gap-4">
                  <AlertDescription className={feedback.type === "error" ? "text-red-50 font-medium" : ""}>
                    {feedback.message}
                  </AlertDescription>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className={feedback.type === "error" ? "text-sm text-red-50/90 underline hover:text-red-50" : "text-sm text-slate-200 underline"}
                  >
                    Close
                  </button>
                </div>
              </Alert>
              )}

            {isJourneyMode ? (
              <section className="flex flex-1 flex-col">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  {/* Fixed header bar with blur effect on content below */}
                  <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6">
                    {/* Blur overlay for content passing underneath */}
                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950 via-slate-950/95 to-transparent backdrop-blur-xl pointer-events-none" />
                    
                    {/* Header content */}
                    <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
                      <div className="flex-1">
                        <p className="text-xs uppercase tracking-wide text-indigo-200">Exploration projet</p>
                        <h2 className="text-2xl font-semibold text-white">
                          {selectedProject?.name || "Parcours projet"}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {selectedProject && (
                          <>
                            <Button
                              type="button"
                              variant="glassDark"
                              onClick={() => startProjectEdit(selectedProject.id)}
                              className="gap-2"
                            >
                              <Pencil className="h-4 w-4" />
                              Éditer
                            </Button>
                            <Button
                              type="button"
                              variant="glassDark"
                              onClick={() => window.open(`/admin/projects/${selectedProject.id}/synthesis`, '_blank')}
                              className="gap-2"
                            >
                              <Sparkles className="h-4 w-4" />
                              Synthèse
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="glassDark"
                          onClick={() => setShowJourneyBoard(false)}
                        >
                          Fermer
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Project details */}
                  {selectedProject ? (
                    <>
                      {selectedProject?.clientName ? (
                        <p className="mb-4 text-sm text-slate-300">Client: {selectedProject.clientName}</p>
                      ) : null}
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Status</p>
                          <p className="mt-1 text-sm font-medium text-slate-100 capitalize">
                            {selectedProject.status ?? "unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Timeline</p>
                          <p className="mt-1 text-sm font-medium text-slate-100">
                            {selectedProject.startDate && selectedProject.endDate
                              ? `${new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(selectedProject.startDate))} – ${new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(selectedProject.endDate))}`
                              : "Not specified"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">Start date</p>
                          <p className="mt-1 text-sm font-medium text-slate-100">
                            {selectedProject.startDate
                              ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(selectedProject.startDate))
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-slate-400">End date</p>
                          <p className="mt-1 text-sm font-medium text-slate-100">
                            {selectedProject.endDate
                              ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(selectedProject.endDate))
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {selectedProject.description ? (
                        <p className="mt-4 text-sm text-slate-300">{selectedProject.description}</p>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4">
                  {selectedProjectId && <ProjectJourneyBoard projectId={selectedProjectId} hideHeader={true} />}
                </div>
              </section>
            ) : (
              <div className="flex flex-1 flex-col min-h-0">
                {!showOnlyChallengeWorkspace && (
                  <section ref={dashboardRef} id="section-dashboard">
                    <div className="flex items-center justify-between">
                      <h1 className="text-3xl font-semibold">Operational dashboard</h1>
                      <div className="hidden gap-3 md:flex">
                        <Button
                          type="button"
                          className={gradientButtonClasses}
                          onClick={() => setShowClientForm(true)}
                        >
                          Create client
                        </Button>
                        <Button variant="glassDark">
                          Export data
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      Manage the full journey from organization onboarding to live ASK sessions.
                    </p>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {stats.map(stat => {
                        const Icon = stat.icon;
                        return (
                          <div
                            key={stat.label}
                            className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/0 p-5 shadow-lg"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-slate-400">{stat.label}</p>
                                <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                              </div>
                              <div className="rounded-full bg-white/10 p-2">
                                <Icon className="h-5 w-5 text-indigo-300" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

            {!showOnlyChallengeWorkspace && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">Clients → Projects → Users</h2>
                  <p className="text-sm text-slate-400">Drill down to manage everything from one place.</p>
                </div>

              <div
                className="grid gap-6 lg:grid-cols-3"
                style={columnTemplate ? { gridTemplateColumns: columnTemplate } : undefined}
              >
                <div
                  ref={clientsRef}
                  id="section-clients"
                  className="relative flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <header className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Clients</h3>
                      <p className="text-xs text-slate-400">Select a client to reveal related projects.</p>
                    </div>
                    <Button
                      type="button"
                      className={`${gradientButtonClasses} h-9 px-4 text-xs`}
                      onClick={() => {
                        if (showClientForm) {
                          cancelClientEdit();
                        } else {
                          resetClientForm();
                          setShowClientForm(true);
                        }
                      }}
                      disabled={isBusy}
                    >
                      {showClientForm ? "Close" : "Add client"}
                    </Button>
                  </header>

                  {showClientForm && (
                    <form
                      onSubmit={clientForm.handleSubmit(handleSubmitClient)}
                      className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                    >
                      {isEditingClient && (
                        <p className="text-xs font-medium text-amber-300">
                          Editing {clients.find(client => client.id === editingClientId)?.name}
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="client-name">Name</Label>
                        <Input
                          id="client-name"
                          placeholder="Enter the organization name"
                          {...clientForm.register("name")}
                          disabled={isBusy}
                        />
                        {clientForm.formState.errors.name && (
                          <p className="text-xs text-red-400">{clientForm.formState.errors.name.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="client-email">Email</Label>
                        <Input
                          id="client-email"
                          placeholder="contact@company.com"
                          {...clientForm.register("email")}
                          disabled={isBusy}
                        />
                        {clientForm.formState.errors.email && (
                          <p className="text-xs text-red-400">{clientForm.formState.errors.email.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="client-company">Company</Label>
                        <Input
                          id="client-company"
                          placeholder="Legal entity"
                          {...clientForm.register("company")}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="client-industry">Industry</Label>
                        <Input
                          id="client-industry"
                          placeholder="Industry focus"
                          {...clientForm.register("industry")}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="client-status">Status</Label>
                        <select
                          id="client-status"
                          className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                          {...clientForm.register("status")}
                          disabled={isBusy}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                      <div className="flex justify-end gap-2">
                        {isEditingClient && (
                          <Button
                            type="button"
                            variant="glassDark"
                            onClick={cancelClientEdit}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                          {isEditingClient ? "Update client" : "Save client"}
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3 overflow-y-auto pr-2">
                    {isLoading && clients.length === 0 ? (
                      <p className="text-sm text-slate-400">Loading clients...</p>
                    ) : clients.length === 0 ? (
                      <p className="text-sm text-slate-400">No clients registered yet.</p>
                    ) : (
                      clients.map(client => (
                        <article
                          key={client.id}
                          className={`rounded-2xl border px-4 py-3 transition hover:border-indigo-400 ${
                            client.id === selectedClientId
                              ? "border-indigo-400 bg-indigo-500/10"
                              : "border-white/10 bg-slate-900/40"
                          }`}
                        >
                          <button
                            type="button"
                            className="flex w-full items-center justify-between"
                            onClick={() => setSelectedClientId(client.id)}
                          >
                            <div className="text-left">
                              <h4 className="text-sm font-semibold text-white">{client.name}</h4>
                              <p className="text-xs text-slate-400">
                                {client.email ? client.email : "No contact email"}
                              </p>
                            </div>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                              {client.status}
                            </span>
                          </button>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>
                              {projects.filter(project => project.clientId === client.id).length} projects
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startClientEdit(client.id)}
                                className="text-slate-200 hover:text-white"
                                disabled={isBusy}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteClient(client.id)}
                                className="text-red-300 hover:text-red-200"
                                disabled={isBusy}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                  {isLargeScreen && (
                    <div
                      role="separator"
                      aria-label="Resize clients column"
                      aria-orientation="vertical"
                      className="absolute inset-y-0 right-[-8px] hidden w-4 cursor-col-resize items-center justify-center lg:flex"
                      onMouseDown={event => handleResizeStart(event, 0)}
                    >
                      <span className="pointer-events-none h-12 w-px rounded-full bg-white/20" />
                    </div>
                  )}
                </div>

                <div
                  ref={projectsRef}
                  id="section-projects"
                  className="relative flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <header className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Projects</h3>
                      <p className="text-xs text-slate-400">Only projects for the selected client are displayed.</p>
                    </div>
                    <Button
                      type="button"
                      className={`${gradientButtonClasses} h-9 px-4 text-xs`}
                      onClick={() => {
                        if (showProjectForm) {
                          cancelProjectEdit();
                        } else {
                          resetProjectForm();
                          setShowProjectForm(true);
                        }
                      }}
                      disabled={!selectedClient || isBusy}
                    >
                      {showProjectForm ? "Close" : "Add project"}
                    </Button>
                  </header>

                  {!selectedClient && (
                    <p className="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 p-6 text-sm text-slate-400">
                      Select a client to manage its projects.
                    </p>
                  )}

                  {showProjectForm && selectedClient && (
                    <form
                      onSubmit={projectForm.handleSubmit(handleSubmitProject)}
                      className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                    >
                      {isEditingProject && (
                        <p className="text-xs font-medium text-amber-300">
                          Editing {projects.find(project => project.id === editingProjectId)?.name}
                        </p>
                      )}
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="project-name">Name</Label>
                        <Input
                          id="project-name"
                          placeholder="Name your project"
                          {...projectForm.register("name")}
                          disabled={isBusy}
                        />
                        {projectForm.formState.errors.name && (
                          <p className="text-xs text-red-400">{projectForm.formState.errors.name.message}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="project-description">Description</Label>
                        <Textarea
                          id="project-description"
                          rows={3}
                          placeholder="What outcomes are expected?"
                          {...projectForm.register("description")}
                          disabled={isBusy}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <FormDateTimeField
                          control={projectForm.control}
                          name="startDate"
                          id="project-start"
                          label="Start date"
                          placeholder="Select start date"
                          disabled={isBusy}
                          error={projectForm.formState.errors.startDate?.message}
                        />
                        <FormDateTimeField
                          control={projectForm.control}
                          name="endDate"
                          id="project-end"
                          label="End date"
                          placeholder="Select end date"
                          disabled={isBusy}
                          error={projectForm.formState.errors.endDate?.message}
                        />
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="project-status">Status</Label>
                          <select
                            id="project-status"
                            className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                            {...projectForm.register("status")}
                            disabled={isBusy}
                          >
                            {projectStatuses.map(status => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="project-owner">Owner</Label>
                          <select
                            id="project-owner"
                            className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                            {...projectForm.register("createdBy")}
                            disabled={isBusy}
                          >
                            <option value="">Unassigned</option>
                            {filteredUsers.map(user => (
                              <option key={user.id} value={user.id}>
                                {user.fullName || user.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        {isEditingProject && (
                          <Button
                            type="button"
                            variant="glassDark"
                            onClick={cancelProjectEdit}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                          {isEditingProject ? "Update project" : "Save project"}
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="space-y-3 overflow-y-auto pr-2">
                    {projectsForClient.length === 0 ? (
                      <p className="text-sm text-slate-400">No projects for this client yet.</p>
                    ) : (
                      projectsForClient.map(project => (
                        <article
                          key={project.id}
                          className={`rounded-2xl border px-4 py-3 transition hover:border-indigo-400 ${
                            project.id === selectedProjectId
                              ? "border-indigo-400 bg-indigo-500/10"
                              : "border-white/10 bg-slate-900/40"
                          }`}
                        >
                          <button
                            type="button"
                            className="flex w-full items-start justify-between gap-3"
                            onClick={() => setSelectedProjectId(project.id)}
                          >
                            <div className="text-left">
                              <h4 className="text-sm font-semibold text-white">{project.name}</h4>
                              <p className="text-xs text-slate-400">{project.description || "No description"}</p>
                            </div>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                              {project.status}
                            </span>
                          </button>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>
                              {challenges.filter(challenge => challenge.projectId === project.id).length} challenges
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-8 rounded-full border border-white/20 bg-white/10 px-3 text-[11px] font-semibold uppercase tracking-wide text-indigo-100 hover:bg-white/20"
                                onClick={() => {
                                  setSelectedProjectId(project.id);
                                  setShowJourneyBoard(true);
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <Compass className="h-3.5 w-3.5" />
                                  Explorer
                                </div>
                              </Button>
                              <button
                                type="button"
                                onClick={() => startProjectEdit(project.id)}
                                className="text-slate-200 hover:text-white"
                                disabled={isBusy}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteProject(project.id)}
                                className="text-red-300 hover:text-red-200"
                                disabled={isBusy}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                  {isLargeScreen && (
                    <div
                      role="separator"
                      aria-label="Resize projects column"
                      aria-orientation="vertical"
                      className="absolute inset-y-0 right-[-8px] hidden w-4 cursor-col-resize items-center justify-center lg:flex"
                      onMouseDown={event => handleResizeStart(event, 1)}
                    >
                      <span className="pointer-events-none h-12 w-px rounded-full bg-white/20" />
                    </div>
                  )}
                </div>

                <div
                  ref={usersRef}
                  id="section-users"
                  className="relative flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Users</h3>
                      <p className="text-xs text-slate-400">
                        {selectedClient
                          ? `Directory for ${selectedClient.name}. Admins stay visible regardless of client.`
                          : "Directory across all clients. Admins stay visible for quick access."}
                      </p>
                      {selectedProject && (
                        <p className="text-[11px] text-slate-500">
                          Members of {selectedProject.name} appear first, with other client users ready to add.
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      className={`${gradientButtonClasses} h-9 px-4 text-xs`}
                      onClick={() => {
                        if (showUserForm) {
                          cancelUserEdit();
                        } else {
                          resetUserForm();
                          setShowUserForm(true);
                        }
                      }}
                      disabled={isBusy}
                    >
                      {showUserForm ? "Close" : "Add user"}
                    </Button>
                  </header>

                  {showUserForm && (
                    <>
                      {editingUserId ? (
                        <form
                          onSubmit={userForm.handleSubmit(handleSubmitUser)}
                          className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                        >
                          <p className="text-xs font-medium text-amber-300">
                            Editing {users.find(user => user.id === editingUserId)?.fullName || users.find(user => user.id === editingUserId)?.email}
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <Label htmlFor="user-email-admin">Email</Label>
                              <Input
                                id="user-email-admin"
                                type="email"
                                placeholder="user@company.com"
                                {...userForm.register("email")}
                                disabled={isBusy}
                              />
                              {userForm.formState.errors.email && (
                                <p className="text-xs text-red-400">{userForm.formState.errors.email.message}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor="user-firstname-admin">First name</Label>
                              <Input
                                id="user-firstname-admin"
                                placeholder="John"
                                {...userForm.register("firstName")}
                                disabled={isBusy}
                              />
                              {userForm.formState.errors.firstName && (
                                <p className="text-xs text-red-400">{userForm.formState.errors.firstName.message}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor="user-lastname-admin">Last name</Label>
                              <Input
                                id="user-lastname-admin"
                                placeholder="Doe"
                                {...userForm.register("lastName")}
                                disabled={isBusy}
                              />
                              {userForm.formState.errors.lastName && (
                                <p className="text-xs text-red-400">{userForm.formState.errors.lastName.message}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor="user-job-title-admin">Job Title</Label>
                              <Input
                                id="user-job-title-admin"
                                placeholder="e.g. Product Manager"
                                {...userForm.register("jobTitle")}
                                disabled={isBusy}
                              />
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor="user-role-admin">Role</Label>
                              <select
                                id="user-role-admin"
                                className="h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-sm text-white"
                                {...userForm.register("role")}
                                disabled={isBusy}
                              >
                                <option value="full_admin">Full Admin</option>
                                <option value="project_admin">Project Admin</option>
                                <option value="facilitator">Facilitator</option>
                                <option value="manager">Manager</option>
                                <option value="participant">Participant</option>
                                <option value="user">User</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="glassDark"
                              onClick={cancelUserEdit}
                              disabled={isBusy}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                              Update user
                            </Button>
                          </div>
                        </form>
                      ) : selectedProjectId ? (
                        <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="add-user-search">Rechercher un utilisateur</Label>
                            <UserSearchCombobox
                              users={availableUsersForSearch}
                              selectedUserId={selectedUserForProject?.id ?? null}
                              onSelect={handleUserSelectedForProject}
                              onCreateNew={handleCreateNewUserForProject}
                              placeholder="Rechercher par nom, email ou job title..."
                              disabled={isBusy}
                            />
                          </div>
                          {availableUsersForSearch.length === 0 && (
                            <p className="text-xs text-slate-400">
                              Aucun utilisateur disponible. Vous devez avoir accès à un client pour voir ses utilisateurs.
                            </p>
                          )}
                        </div>
                      ) : (
                        <form
                          onSubmit={userForm.handleSubmit(handleSubmitUser)}
                          className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                        >
                          <p className="text-xs text-slate-400">Sélectionnez un projet pour ajouter des utilisateurs par email.</p>
                        </form>
                      )}
                    </>
                  )}

                  <div className="space-y-3 overflow-y-auto pr-2">
                    {isLoading && filteredUsers.length === 0 ? (
                      <p className="text-sm text-slate-400">Loading users...</p>
                    ) : filteredUsers.length === 0 ? (
                      <p className="text-sm text-slate-400">No users available in this directory yet.</p>
                    ) : (
                      filteredUsers.map(user => {
                        const projectIds = user.projectIds ?? [];
                        const isMemberOfSelectedProject = selectedProjectId ? projectIds.includes(selectedProjectId) : false;
                        const canManageMembership = Boolean(
                          selectedProjectId && selectedProject && viewingClientId && user.clientId === viewingClientId
                        );

                        return (
                          <article
                            key={user.id}
                            className={`rounded-2xl border px-4 py-3 transition hover:border-indigo-400 ${
                              user.id === editingUserId
                                ? "border-indigo-400 bg-indigo-500/10"
                                : "border-white/10 bg-slate-900/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-left">
                                <h4 className="text-sm font-semibold text-white">{user.fullName || user.email}</h4>
                                <p className="text-xs text-slate-400">{user.email}</p>
                                {user.jobTitle && (
                                  <p className="text-xs text-slate-500 italic">{user.jobTitle}</p>
                                )}
                                <p className="text-[11px] text-slate-500">
                                  {user.clientName || "No client assigned"}
                                  {viewingClientId && user.clientId && user.clientId !== viewingClientId
                                    ? " • other client"
                                    : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-200">
                                  {user.role}
                                </span>
                                <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-wide ${
                                  user.isActive ? "bg-green-500/20 text-green-300" : "bg-slate-500/20 text-slate-300"
                                }`}>
                                  {user.isActive ? "Active" : "Inactive"}
                                </span>
                              </div>
                            </div>
                            {selectedProjectId && (
                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                                <span className={isMemberOfSelectedProject ? "text-indigo-200" : undefined}>
                                  {isMemberOfSelectedProject
                                    ? `Assigned to ${selectedProject?.name ?? "project"}`
                                    : "Not assigned to this project"}
                                </span>
                                <Button
                                  type="button"
                                  variant={isMemberOfSelectedProject ? "glassDark" : "secondary"}
                                  size="sm"
                                  className="h-7 px-3 text-[11px]"
                                  onClick={() => {
                                    if (isMemberOfSelectedProject) {
                                      void handleRemoveUserFromProject(user.id);
                                    } else {
                                      void handleAddUserToProject(user.id);
                                    }
                                  }}
                                  disabled={isBusy}
                                >
                                  {isMemberOfSelectedProject ? "Remove from project" : "Add to project"}
                                </Button>
                              </div>
                            )}
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                              <span>Joined {formatDateTime(user.createdAt)}</span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => startUserEdit(user.id)}
                                  className="text-slate-200 hover:text-white"
                                  disabled={isBusy}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="text-red-300 hover:text-red-200"
                                  disabled={isBusy}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                  {isLargeScreen && (
                    <div
                      role="separator"
                      aria-label="Resize users column"
                      aria-orientation="vertical"
                      className="absolute inset-y-0 right-[-8px] hidden w-4 cursor-col-resize items-center justify-center lg:flex"
                      onMouseDown={event => handleResizeStart(event, 2)}
                    >
                      <span className="pointer-events-none h-12 w-px rounded-full bg-white/20" />
                    </div>
                  )}
                </div>
                </div>
              </section>
            )}

            {!showOnlyChallengeWorkspace && (
              <section
                ref={insightsRef}
                id="section-insights"
                className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Insights</h2>
                  <p className="text-sm text-slate-400">Key indicators for the current drilldown.</p>
                </div>
                <Button
                  type="button"
                  variant="glassDark"
                >
                  Export snapshot
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Projects for client</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{projectsForClient.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Visible because of the selected client filter.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Challenges in focus</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{challengesForProject.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Scoped to the highlighted project.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">ASK sessions</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{asksForChallenge.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Connected to the active challenge.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200">
                <p className="font-semibold text-white">Upcoming due date</p>
                <p className="mt-1 text-slate-400">
                  {nextDueChallenge?.dueDate
                    ? `${nextDueChallenge.name} • ${formatDateTime(nextDueChallenge.dueDate)}`
                    : "No upcoming challenge due date for the current project."}
                </p>
              </div>
              </section>
            )}

            {!showOnlyChallengeWorkspace && (
              <section
                id="section-security"
                className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
                <SecurityPanel />
              </section>
            )}

            {!showOnlyChallengeWorkspace && (
              <section
                ref={settingsRef}
                id="section-settings"
                className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
              >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Settings</h2>
                  <p className="text-sm text-slate-400">Quick administrative preferences for the workspace.</p>
                </div>
                <Button type="button" className={`${gradientButtonClasses} px-4`}>
                  Save preferences
                </Button>
              </div>

              <div className="space-y-4">
                <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200">
                  <span>Send weekly summary emails</span>
                  <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-slate-900" defaultChecked />
                </label>
                <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200">
                  <span>Enable beta features for facilitators</span>
                  <input type="checkbox" className="h-4 w-4 rounded border-white/20 bg-slate-900" />
                </label>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-200">
                  <p className="font-semibold text-white">Environment</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Sync configuration with partner integrations and deployment targets from here.
                  </p>
                  <Button
                    type="button"
                    variant="glassDark"
                    className="mt-4"
                  >
                    Open advanced settings
                  </Button>
                </div>
              </div>
              </section>
            )}

              </div>
            )}

          </main>
        </div>
      </div>
    </div>
    </>
  );
}
