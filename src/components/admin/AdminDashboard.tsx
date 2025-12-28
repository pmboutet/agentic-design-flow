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
  Network,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  UserPlus,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ProjectJourneyBoard } from "@/components/project/ProjectJourneyBoard";
import { AddUserToProjectDialog } from "@/components/project/AddUserToProjectDialog";
import { FormDateTimeField } from "./FormDateTimeField";
import { GraphRAGPanel } from "./GraphRAGPanel";
import { ProjectGraphVisualization } from "@/components/graph/ProjectGraphVisualization";
import { SecurityPanel } from "./SecurityPanel";
import { useAdminResources } from "./useAdminResources";
import { useAuth } from "@/components/auth/AuthProvider";
import { UserSearchCombobox } from "@/components/ui/user-search-combobox";
import { useAdminSearch, type SearchResultType, type SearchResultItem } from "./AdminSearchContext";
import { useClientContext } from "./ClientContext";
import { useProjectContext, type ProjectSelection } from "./ProjectContext";
import { formatDateTime, toInputDate, formatDisplayValue } from "./dashboard/utils";
import { gradientButtonClasses, defaultColumnWidths, minColumnWidths, maxColumnWidths, type ColumnWidths } from "./dashboard/constants";
import type { ApiResponse, ChallengeRecord, ClientRecord, ManagedUser, ProjectRecord } from "@/types";

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
  description: z.string().trim().max(10000).optional().or(z.literal("")),
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

const userRoles = ["full_admin", "client_admin", "facilitator", "manager", "participant"] as const;

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
type UserFormInput = z.infer<typeof userFormSchema>;

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
  { label: "Projects", icon: FolderKanban, targetId: "section-projects" },
  { label: "Challenges", icon: Target, targetId: "section-challenges" },
  { label: "Users", icon: Users, targetId: "section-users" },
  { label: "Insights", icon: ClipboardList, targetId: "section-insights" },
  { label: "Graph RAG", icon: Network, targetId: "section-graph-rag" },
  { label: "Settings", icon: Settings, targetId: "section-settings" }
] as const;

type SectionId = (typeof navigationItems)[number]["targetId"];
type SectionLabel = (typeof navigationItems)[number]["label"];

const searchResultTypeConfig: Record<Exclude<SearchResultType, "ask">, { label: string; icon: LucideIcon }> = {
  client: { label: "Client", icon: Building2 },
  project: { label: "Project", icon: FolderKanban },
  challenge: { label: "Challenge", icon: Target },
  user: { label: "User", icon: Users }
};

interface ChallengeDetailDialogProps {
  challenge: ChallengeRecord | null;
  projectName?: string | null;
  onClose: () => void;
}

function ChallengeDetailDialog({ challenge, projectName, onClose }: ChallengeDetailDialogProps) {
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


// AddParticipantsDialog removed - now using shared AddUserToProjectDialog component

export function AdminDashboard({ initialProjectId = null, mode = "default" }: AdminDashboardProps = {}) {
  const router = useRouter();
  const { profile, status, user, signOut } = useAuth();
  const searchContext = useAdminSearch();
  const {
    clients,
    users,
    projects,
    challenges,
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
    deleteUser,
    deleteClient,
    deleteProject,
    deleteChallenge,
    addUserToProject,
    removeUserFromProject,
    findUserByEmail,
    createUserAndAddToProject,
    refreshUsers
  } = useAdminResources();

  // Get client selection from context (managed in sidebar)
  const { selectedClientId, setSelectedClientId, clients: contextClients, selectedClient: contextSelectedClient } = useClientContext();

  // Get project selection from context (managed in sidebar)
  const {
    selectedProjectId: globalProjectId,
    setSelectedProjectId: setGlobalProjectId,
    selectedProject: contextSelectedProject
  } = useProjectContext();

  // Local state for project selection, synced with global context
  const [selectedProjectId, setSelectedProjectIdLocal] = useState<string | null>(initialProjectId ?? null);

  // Sync local selection with global context
  const setSelectedProjectId = useCallback((projectId: string | null) => {
    setSelectedProjectIdLocal(projectId);
    // Also update global context when changing project in dashboard
    if (projectId) {
      setGlobalProjectId(projectId);
    }
  }, [setGlobalProjectId]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [selectedUserForProject, setSelectedUserForProject] = useState<ManagedUser | null>(null);
  const [showJourneyBoard, setShowJourneyBoard] = useState(false);
  const [showAddParticipantsDialog, setShowAddParticipantsDialog] = useState(false);
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


  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [challengeDetailId, setChallengeDetailId] = useState<string | null>(null);

  const showOnlyChallengeWorkspace = mode === "project-relationships";

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const dashboardRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const challengesRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<HTMLDivElement>(null);
  const insightsRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const graphRagRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const sectionRefMap = useMemo<Record<SectionId, RefObject<HTMLDivElement | null>>>(
    () => ({
      "section-dashboard": dashboardRef,
      "section-projects": projectsRef,
      "section-challenges": challengesRef,
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

  const navigationMenu = useMemo(() => {
    if (showOnlyChallengeWorkspace) {
      return navigationItems.filter(item =>
        item.targetId === "section-challenges"
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

  const userForm = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultUserFormValues
  });

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
    // If "all" is selected, don't change it when viewing a project
    if (project && selectedClientId !== "all" && project.clientId !== selectedClientId) {
      setSelectedClientId(project.clientId ?? "all");
    }
  }, [projects, selectedProjectId, showOnlyChallengeWorkspace, selectedClientId, setSelectedClientId]);

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

  // Client initialization is now handled by ClientContext

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

    users.forEach(user => {
      const displayName = (
        user.fullName ||
        `${user.firstName ?? ""} ${user.lastName ?? ""}` ||
        ""
      ).trim();
      const nameValue = displayName.length > 0 ? displayName : null;

      // Check if any client membership name matches the search
      const matchesAnyClientName = user.clientMemberships?.some(cm => matchesText(cm.clientName)) ?? false;

      if (
        matchesText(nameValue) ||
        matchesText(user.email) ||
        matchesText(user.role) ||
        matchesAnyClientName
      ) {
        // For display, show the first client name as fallback (or get from clientById map)
        const clientName = user.clientMemberships?.[0]?.clientName || (user.clientMemberships?.[0]?.clientId ? clientById.get(user.clientMemberships[0].clientId)?.name : undefined);
        addResult({
          id: user.id,
          type: "user",
          title: nameValue || user.email,
          subtitle: [user.role, clientName].filter(Boolean).join(" • ") || undefined,
          clientId: user.clientMemberships?.[0]?.clientId ?? null
        });
      }
    });

    return results.slice(0, 20);
  }, [
    normalizedSearchQuery,
    clients,
    projects,
    challenges,
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

      if (result.type === "challenge") {
        setChallengeDetailId(result.id);
      } else {
        setChallengeDetailId(null);
      }

      setShowProjectForm(false);
      setShowUserForm(false);

      switch (result.type) {
        case "client":
          // Client selection is now in sidebar, go to projects
          scrollToSection("section-projects");
          break;
        case "project":
          scrollToSection("section-projects");
          break;
        case "challenge":
          scrollToSection("section-challenges");
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
      setChallengeDetailId,
      setShowProjectForm,
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

  // Filter projects by client first
  const projectsFilteredByClient = useMemo(
    () => selectedClientId === "all"
      ? projects
      : projects.filter(project => project.clientId === selectedClientId),
    [projects, selectedClientId]
  );

  // Further filter by global project selection from sidebar
  const projectsForClient = useMemo(
    () => globalProjectId === "all"
      ? projectsFilteredByClient
      : projectsFilteredByClient.filter(project => project.id === globalProjectId),
    [projectsFilteredByClient, globalProjectId]
  );

  // Sync local project selection with global context when it changes
  useEffect(() => {
    if (globalProjectId !== "all") {
      // A specific project is selected in the sidebar
      if (projectsFilteredByClient.some(p => p.id === globalProjectId)) {
        setSelectedProjectIdLocal(globalProjectId);
      }
    }
  }, [globalProjectId, projectsFilteredByClient]);

  useEffect(() => {
    if (projectsForClient.length > 0) {
      if (!selectedProjectId || !projectsForClient.some(project => project.id === selectedProjectId)) {
        setSelectedProjectIdLocal(projectsForClient[0].id);
      }
    } else {
      setSelectedProjectIdLocal(null);
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

  // selectedClient comes from context
  const selectedClient = contextSelectedClient;

  const selectedProject = useMemo(
    () => projects.find(project => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const isJourneyMode = Boolean(showJourneyBoard && selectedProjectId);

  const selectedChallenge = useMemo(
    () => challenges.find(challenge => challenge.id === selectedChallengeId) ?? null,
    [challenges, selectedChallengeId]
  );

  
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

  const projectContextMissing = useMemo(
    () =>
      showOnlyChallengeWorkspace && Boolean(initialProjectId) && !isLoading && !selectedProject,
    [showOnlyChallengeWorkspace, initialProjectId, isLoading, selectedProject]
  );

  const isEditingProject = Boolean(editingProjectId);
  const isEditingUser = Boolean(editingUserId);

  useEffect(() => {
    if (!showUserForm || isEditingUser) {
      return;
    }
    // If "all" is selected, use empty string for user form (user will need to select a client)
    const targetClientId = selectedClientId === "all" ? "" : (selectedClientId ?? "");
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
      { label: "Challenges", value: challenges.length, icon: Target }
    ],
    [clients.length, projects.length, challenges.length]
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


  const resetProjectForm = () => {
    projectForm.reset(defaultProjectFormValues);
    setEditingProjectId(null);
  };

  const handleSubmitProject = async (values: ProjectFormInput) => {
    // If "all" is selected, require a specific client selection
    const targetClientId = selectedClientId === "all"
      ? selectedProject?.clientId
      : (selectedClientId || selectedProject?.clientId);
    if (!targetClientId) {
      setFeedback({
        type: "error",
        message: "Sélectionnez un client avant de créer ou modifier un projet."
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
    setChallengeDetailId(challenge.id);
    setActiveSection("Challenges");
  };

  const resetUserForm = () => {
    // If "all" is selected, use empty string (user must select specific client)
    const clientIdForForm = selectedClientId === "all" ? "" : (selectedClientId ?? "");
    userForm.reset({ ...defaultUserFormValues, clientId: clientIdForForm });
    setEditingUserId(null);
  };

  const handleSubmitUser = async (values: UserFormInput) => {
    // Remove fullName as it's not accepted by the API - it's computed from firstName/lastName
    const { fullName, ...payload } = values;
    if (editingUserId) {
      payload.clientId = values.clientId ?? "";
      await updateUser(editingUserId, payload);
    } else {
      // For new users, require a valid client selection
      const targetClientId = selectedClientId === "all" ? values.clientId : selectedClientId;
      if (!targetClientId) {
        setFeedback({
          type: "error",
          message: "Sélectionnez un client avant de créer un utilisateur."
        });
        return;
      }
      payload.clientId = targetClientId;
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

    // Prefer selectedClientId if user belongs to it, otherwise use first membership
    const contextualClientId = selectedClientId && selectedClientId !== "all"
      && user.clientMemberships?.some(cm => cm.clientId === selectedClientId)
      ? selectedClientId
      : user.clientMemberships?.[0]?.clientId ?? "";

    userForm.reset({
      email: user.email,
      fullName: user.fullName ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: (user.role as UserFormInput["role"]) || "participant",
      clientId: contextualClientId,
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
    // Use project's clientId, or selectedClientId if not "all"
    const clientId = selectedProject?.clientId ?? (selectedClientId === "all" ? undefined : selectedClientId) ?? undefined;
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
    // If "all" is selected, use null to show all users
    const targetClientId = selectedClientId === "all" ? null : (selectedClientId ?? projectClientId ?? null);

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

      // Check if user belongs to the target client (any membership)
      if (targetClientId && user.clientMemberships?.some(cm => cm.clientId === targetClientId)) {
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

      // Check if user belongs to the target client (any membership)
      const aClientPriority = targetClientId ? (a.clientMemberships?.some(cm => cm.clientId === targetClientId) ? 0 : 1) : 0;
      const bClientPriority = targetClientId ? (b.clientMemberships?.some(cm => cm.clientId === targetClientId) ? 0 : 1) : 0;
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

  // Find current user in ManagedUser list to get their client memberships
  const currentUserId = profile?.id ?? user?.profile?.id;
  const currentManagedUser = useMemo(() => {
    return currentUserId ? users.find(u => u.id === currentUserId) : null;
  }, [currentUserId, users]);
  const profileClientId = currentManagedUser?.clientMemberships?.[0]?.clientId ?? null;

  const availableUsersForSearch = useMemo(() => {
    if (!profile && !user?.profile) {
      return [];
    }

    // Helper to check if user belongs to a client (via client_members)
    const userBelongsToClient = (u: ManagedUser, clientId: string) => {
      const hasClientMembership = u.clientMemberships?.some(cm => cm.clientId === clientId);
      return hasClientMembership;
    };

    // Determine client filter based on selected client in UI
    const uiClientFilter = selectedClientId === "all" ? null : selectedClientId;

    // Full admins see users filtered by selected client (or all if "all" selected)
    if (profileRoleLower === "full_admin") {
      if (uiClientFilter) {
        return users.filter(u => userBelongsToClient(u, uiClientFilter));
      }
      return users;
    }

    // Client admins, facilitators, managers see only users from their client
    // Also respect UI client filter if it matches their access
    if (["client_admin", "facilitator", "manager"].includes(profileRoleLower)) {
      if (!profileClientId) return [];
      // If UI has a client selected, use it only if it matches their own client
      const effectiveClientId = uiClientFilter && uiClientFilter === profileClientId
        ? uiClientFilter
        : profileClientId;
      return users.filter(u => userBelongsToClient(u, effectiveClientId));
    }

    return [];
  }, [users, profileRoleLower, profileClientId, selectedClientId]);

  // All hooks must be called before any conditional returns
  // Calculate values that depend on filteredUsers and other data
  // If "all" is selected, use null to show all clients' data
  const viewingClientId = selectedClientId === "all" ? null : (selectedClientId ?? selectedProject?.clientId ?? null);
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
                    <div className="mt-2 flex items-center justify-end text-xs text-slate-500">
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
              </>
            ) : (
              <p className="text-sm text-slate-400">Select a challenge to review its details.</p>
            )}
          </div>
        </div>
      ) : (
        <div
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
        onClose={() => setChallengeDetailId(null)}
      />
      {selectedProjectId && (
        <AddUserToProjectDialog
          open={showAddParticipantsDialog}
          onOpenChange={setShowAddParticipantsDialog}
          projectId={selectedProjectId}
          currentMemberUserIds={users
            .filter(u => u.projectIds?.includes(selectedProjectId))
            .map(u => u.id)}
          onUserAdded={() => refreshUsers()}
        />
      )}
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
                {selectedProjectId && (
                  <ProjectJourneyBoard
                    projectId={selectedProjectId}
                    onClose={() => setShowJourneyBoard(false)}
                  />
                )}
              </section>
            ) : (
              <div className="flex flex-1 flex-col min-h-0 space-y-8">
                {!showOnlyChallengeWorkspace && (
                  <section ref={dashboardRef} id="section-dashboard">
                    <div className="flex items-center justify-between">
                      <h1 className="text-3xl font-semibold">Operational dashboard</h1>
                      <div className="hidden gap-3 md:flex">
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

                {/* Knowledge Graph Visualization - Full Width */}
                {!showOnlyChallengeWorkspace && (
                  <section className="space-y-4">
                    <ProjectGraphVisualization projectId={selectedProjectId} clientId={selectedClientId} />
                  </section>
                )}

            {!showOnlyChallengeWorkspace && (
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-semibold">Projects → Détails</h2>
                  <p className="text-sm text-slate-400">Gérez les projets et leurs challenges depuis une seule vue.</p>
                </div>

              <div
                className="grid gap-6 lg:grid-cols-2"
                style={columnTemplate ? { gridTemplateColumns: columnTemplate } : undefined}
              >
                <div
                  ref={projectsRef}
                  id="section-projects"
                  className="relative flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <header className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">Projects</h3>
                      <p className="text-xs text-slate-400">
                        {selectedClientId === "all"
                          ? "Tous les projets sont affichés."
                          : "Projets du client sélectionné."}
                      </p>
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
                      disabled={(selectedClientId === "all" && !selectedProject) || isBusy}
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
                      onMouseDown={event => handleResizeStart(event, 0)}
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
                                <option value="client_admin">Client Admin</option>
                                <option value="facilitator">Facilitator</option>
                                <option value="manager">Manager</option>
                                <option value="participant">Participant</option>
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
                          {availableUsersForSearch.length === 0 && viewingClientId && (
                            <p className="text-xs text-slate-400">
                              Tous les utilisateurs de ce client sont déjà dans le projet. Vous pouvez créer un nouvel utilisateur ci-dessus.
                            </p>
                          )}
                          {availableUsersForSearch.length === 0 && !viewingClientId && (
                            <p className="text-xs text-slate-400">
                              Sélectionnez un client pour voir ses utilisateurs.
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
                        // Check if user belongs to the viewing client (any membership)
                        const canManageMembership = Boolean(
                          selectedProjectId && selectedProject && viewingClientId && user.clientMemberships?.some(cm => cm.clientId === viewingClientId)
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
                                  {user.clientMemberships?.[0]?.clientName || "No client assigned"}
                                  {viewingClientId && user.clientMemberships?.length && !user.clientMemberships.some(cm => cm.clientId === viewingClientId)
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

              <div className="grid gap-4 md:grid-cols-2">
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
