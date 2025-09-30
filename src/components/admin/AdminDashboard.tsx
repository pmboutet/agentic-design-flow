"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  Bell,
  Building2,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Search,
  Settings,
  Target,
  Users
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminResources } from "./useAdminResources";

const clientFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().email("Invalid email address").max(255).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal(""))
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
    )
});

type ClientFormInput = z.infer<typeof clientFormSchema>;
type ProjectFormInput = z.infer<typeof projectFormSchema>;
type ChallengeFormInput = z.infer<typeof challengeFormSchema>;
type AskFormInput = z.infer<typeof askFormSchema>;

const gradientButtonClasses =
  "bg-gradient-to-r from-pink-500 via-fuchsia-500 to-indigo-500 text-white shadow-lg hover:shadow-xl focus-visible:ring-white/70";

type ColumnWidths = [number, number, number];

const defaultColumnWidths: ColumnWidths = [320, 360, 460];
const minColumnWidths: ColumnWidths = [260, 300, 360];
const maxColumnWidths: ColumnWidths = [520, 560, 680];

const navigationItems = [
  { label: "Dashboard", icon: LayoutDashboard, targetId: "section-dashboard" },
  { label: "Clients", icon: Building2, targetId: "section-clients" },
  { label: "Projects", icon: FolderKanban, targetId: "section-projects" },
  { label: "Challenges", icon: Target, targetId: "section-challenges" },
  { label: "ASK Sessions", icon: MessageSquare, targetId: "section-asks" },
  { label: "Users", icon: Users, targetId: "section-users" },
  { label: "Insights", icon: ClipboardList, targetId: "section-insights" },
  { label: "Settings", icon: Settings, targetId: "section-settings" }
];

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

export function AdminDashboard() {
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
    createProject,
    updateChallenge,
    createAsk,
    deleteClient,
    deleteProject,
    deleteChallenge,
    deleteAsk
  } = useAdminResources();

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  const [showClientForm, setShowClientForm] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [showAskForm, setShowAskForm] = useState(false);
  const [manualAskKey, setManualAskKey] = useState(false);
  const [activeSection, setActiveSection] = useState(navigationItems[0].label);
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>(defaultColumnWidths);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const clientsRef = useRef<HTMLDivElement>(null);
  const projectsRef = useRef<HTMLDivElement>(null);
  const challengesRef = useRef<HTMLDivElement>(null);
  const asksRef = useRef<HTMLDivElement>(null);
  const usersRef = useRef<HTMLDivElement>(null);
  const insightsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const sectionRefMap = useMemo(
    () => ({
      "section-dashboard": dashboardRef,
      "section-clients": clientsRef,
      "section-projects": projectsRef,
      "section-challenges": challengesRef,
      "section-asks": asksRef,
      "section-users": usersRef,
      "section-insights": insightsRef,
      "section-settings": settingsRef
    }),
    [dashboardRef, clientsRef, projectsRef, challengesRef, asksRef, usersRef, insightsRef, settingsRef]
  );

  const resizeStartXRef = useRef(0);
  const startColumnWidthsRef = useRef<ColumnWidths>(defaultColumnWidths);
  const activeResizeIndexRef = useRef<number | null>(null);

  const clientForm = useForm<ClientFormInput>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: "", email: "", company: "", industry: "" }
  });

  const projectForm = useForm<ProjectFormInput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "", startDate: "", endDate: "", status: "active", createdBy: "" }
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
    defaultValues: {
      askKey: "",
      name: "",
      question: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "active",
      isAnonymous: false,
      maxParticipants: undefined
    }
  });

  const askNameValue = askForm.watch("name");

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
    if (clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [clients, selectedClientId]);

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

  const selectedChallenge = useMemo(
    () => challenges.find(challenge => challenge.id === selectedChallengeId) ?? null,
    [challenges, selectedChallengeId]
  );

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

  const columnTemplate = useMemo(
    () => (isLargeScreen ? `${columnWidths[0]}px ${columnWidths[1]}px ${columnWidths[2]}px` : undefined),
    [columnWidths, isLargeScreen]
  );

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
            const matchingItem = navigationItems.find(item => item.targetId === entry.target.id);
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
  }, [sectionRefMap, selectedProjectId, selectedChallengeId]);

  const handleNavigationClick = useCallback(
    (item: (typeof navigationItems)[number]) => {
      setActiveSection(item.label);
      const ref = sectionRefMap[item.targetId];
      if (ref?.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [sectionRefMap]
  );

  const handleCreateClient = async (values: ClientFormInput) => {
    await createClient(values);
    clientForm.reset({ name: "", email: "", company: "", industry: "" });
    setShowClientForm(false);
  };

  const handleCreateProject = async (values: ProjectFormInput) => {
    if (!selectedClientId) {
      return;
    }
    await createProject({
      ...values,
      clientId: selectedClientId
    });
    projectForm.reset({ name: "", description: "", startDate: "", endDate: "", status: "active", createdBy: "" });
    setShowProjectForm(false);
  };

  const handleUpdateChallenge = async (values: ChallengeFormInput) => {
    if (!selectedChallenge) {
      return;
    }
    await updateChallenge(selectedChallenge.id, values);
  };

  const handleCreateAsk = async (values: AskFormInput) => {
    if (!selectedChallenge || !selectedProject) {
      return;
    }
    await createAsk({
      ...values,
      projectId: selectedProject.id,
      challengeId: selectedChallenge.id
    });
    askForm.reset({
      askKey: "",
      name: "",
      question: "",
      description: "",
      startDate: "",
      endDate: "",
      status: "active",
      isAnonymous: false,
      maxParticipants: undefined
    });
    setShowAskForm(false);
    setManualAskKey(false);
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

  const filteredUsers = useMemo(() => {
    if (!selectedClientId) {
      return users;
    }
    return users.filter(user => user.clientId === selectedClientId);
  }, [users, selectedClientId]);

  const activeUserCount = useMemo(
    () => filteredUsers.filter(user => user.isActive).length,
    [filteredUsers]
  );
  const inactiveUserCount = filteredUsers.length - activeUserCount;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex h-full min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-white/10 bg-white/5 p-6 backdrop-blur lg:flex">
          <div className="mb-8">
            <div className="text-xl font-semibold">Agentic Admin</div>
            <p className="text-sm text-slate-400">Operate the entire flow</p>
          </div>
          <nav className="flex flex-1 flex-col gap-2">
            {navigationItems.map(item => {
              const Icon = item.icon;
              const isActive = activeSection === item.label;
              return (
                <button
                  key={item.label}
                  type="button"
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive
                      ? "bg-white/10 text-white shadow-lg"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                  onClick={() => handleNavigationClick(item)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-6 rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">Need help?</p>
            <p className="mt-1">Review the playbook or contact the product team.</p>
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur"
          >
            <div className="flex items-center justify-between px-6 py-4">
              <div className="hidden md:flex md:max-w-md md:flex-1">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <Input
                    placeholder="Search across clients, projects, sessions..."
                    className="w-full rounded-xl border-white/10 bg-white/5 pl-9 text-sm text-white placeholder:text-slate-300"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Bell className="h-5 w-5" />
                  <span>Notifications</span>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-sm font-semibold">
                  AD
                </div>
              </div>
            </div>
          </motion.header>

          <main className="flex-1 space-y-8 overflow-y-auto px-6 py-8">
            {feedback && (
              <Alert
                variant={feedback.type === "error" ? "destructive" : "default"}
                className="border-white/10 bg-white/5 text-white"
              >
                <div className="flex w-full items-start justify-between gap-4">
                  <AlertDescription>{feedback.message}</AlertDescription>
                  <button type="button" onClick={() => setFeedback(null)} className="text-sm text-slate-200 underline">
                    Close
                  </button>
                </div>
              </Alert>
            )}

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
                  <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/20">
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

            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Clients → Projects → Challenges → ASK</h2>
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
                      onClick={() => setShowClientForm(value => !value)}
                      disabled={isBusy}
                    >
                      {showClientForm ? "Close" : "Add client"}
                    </Button>
                  </header>

                  {showClientForm && (
                    <form
                      onSubmit={clientForm.handleSubmit(handleCreateClient)}
                      className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                    >
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
                      <div className="flex justify-end">
                        <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                          Save client
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
                            <button
                              type="button"
                              onClick={() => handleDeleteClient(client.id)}
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
                      onClick={() => setShowProjectForm(value => !value)}
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
                      onSubmit={projectForm.handleSubmit(handleCreateProject)}
                      className="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4"
                    >
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
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="project-start">Start date</Label>
                          <Input id="project-start" type="datetime-local" {...projectForm.register("startDate")} disabled={isBusy} />
                          {projectForm.formState.errors.startDate && (
                            <p className="text-xs text-red-400">{projectForm.formState.errors.startDate.message}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="project-end">End date</Label>
                          <Input id="project-end" type="datetime-local" {...projectForm.register("endDate")} disabled={isBusy} />
                          {projectForm.formState.errors.endDate && (
                            <p className="text-xs text-red-400">{projectForm.formState.errors.endDate.message}</p>
                          )}
                        </div>
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
                      <div className="flex justify-end">
                        <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                          Save project
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
                            <button
                              type="button"
                              onClick={() => handleDeleteProject(project.id)}
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
                  ref={challengesRef}
                  id="section-challenges"
                  className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur"
                >
                  <header className="flex flex-col gap-1">
                    <h3 className="text-lg font-semibold text-white">Challenges & ASK sessions</h3>
                    <p className="text-xs text-slate-400">
                      Select a challenge to update it and orchestrate new ASK conversations.
                    </p>
                  </header>

                  {selectedProject ? (
                    <div className="grid gap-4 xl:grid-cols-[minmax(240px,0.9fr)_minmax(260px,1.1fr)]">
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
                                <Input id="challenge-due" type="datetime-local" {...challengeForm.register("dueDate")}
                                  disabled={isBusy}
                                />
                              </div>
                              <div className="md:col-span-2 flex justify-end">
                                <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
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
                                    setShowAskForm(value => !value);
                                    if (!showAskForm) {
                                      askForm.reset({
                                        askKey: "",
                                        name: "",
                                        question: "",
                                        description: "",
                                        startDate: "",
                                        endDate: "",
                                        status: "active",
                                        isAnonymous: false,
                                        maxParticipants: undefined
                                      });
                                      setManualAskKey(false);
                                    }
                                  }}
                                  disabled={isBusy}
                                >
                                  {showAskForm ? "Close" : "Create ASK"}
                                </Button>
                              </div>

                              {showAskForm && (
                                <form onSubmit={askForm.handleSubmit(handleCreateAsk)} className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
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
                                        disabled={isBusy}
                                      />
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                                        onClick={() => {
                                          const name = askForm.getValues("name");
                                          askForm.setValue("askKey", generateAskKey(name || "ask"));
                                          setManualAskKey(false);
                                        }}
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
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="flex flex-col gap-2">
                                      <Label htmlFor="ask-start">Start</Label>
                                      <Input id="ask-start" type="datetime-local" {...askForm.register("startDate")} disabled={isBusy} />
                                      {askForm.formState.errors.startDate && (
                                        <p className="text-xs text-red-400">{askForm.formState.errors.startDate.message}</p>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <Label htmlFor="ask-end">End</Label>
                                      <Input id="ask-end" type="datetime-local" {...askForm.register("endDate")} disabled={isBusy} />
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
                                  <div className="flex flex-col gap-2">
                                    <Label htmlFor="ask-max">Max participants</Label>
                                    <Input
                                      id="ask-max"
                                      type="number"
                                      min={1}
                                      placeholder="e.g. 50"
                                      {...askForm.register("maxParticipants")}
                                      disabled={isBusy}
                                    />
                                  </div>
                                  <div className="flex justify-end">
                                    <Button type="submit" className={`${gradientButtonClasses} px-4`} disabled={isBusy}>
                                      Launch ASK
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
                                      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                                        <span>{session.isAnonymous ? "Anonymous" : "Identified"} participants</span>
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
            </section>

            <section
              ref={usersRef}
              id="section-users"
              className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Users</h2>
                  <p className="text-sm text-slate-400">
                    Directory scoped to the selected client when one is active.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  disabled={isBusy}
                >
                  Invite user
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Active</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{activeUserCount}</p>
                  <p className="mt-1 text-xs text-slate-500">Within the current context.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Inactive</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{inactiveUserCount}</p>
                  <p className="mt-1 text-xs text-slate-500">Awaiting activation or archive.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total users</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{filteredUsers.length}</p>
                  <p className="mt-1 text-xs text-slate-500">Filtered by the selected client.</p>
                </div>
              </div>

              <div className="space-y-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-slate-400">No users linked to the current selection.</p>
                ) : (
                  filteredUsers.slice(0, 5).map(user => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-900/40 p-3 text-sm text-slate-200"
                    >
                      <div>
                        <p className="font-semibold text-white">{user.fullName || user.email}</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                      <span
                        className={`text-xs uppercase tracking-wide ${
                          user.isActive ? "text-emerald-300" : "text-slate-500"
                        }`}
                      >
                        {user.role.replace(/_/g, " ")} • {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

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
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20"
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
                    variant="outline"
                    className="mt-4 border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    Open advanced settings
                  </Button>
                </div>
              </div>
            </section>

          </main>
        </div>
      </div>
    </div>
  );
}
