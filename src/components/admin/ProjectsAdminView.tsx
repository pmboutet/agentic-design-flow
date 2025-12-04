"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CalendarRange, Folder, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ProjectRecord } from "@/types";
import { useClientContext } from "./ClientContext";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function formatDate(value?: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(date);
}

// Group projects by client for display when "all" is selected
interface ProjectGroup {
  clientId: string;
  clientName: string;
  projects: ProjectRecord[];
}

export function ProjectsAdminView() {
  const { selectedClientId, selectedClient } = useClientContext();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      const payload = (await response.json()) as ApiResponse<ProjectRecord[]>;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Unable to load projects");
      }
      setProjects(payload.data ?? []);
    } catch (err) {
      console.error("Failed to load projects", err);
      setError(err instanceof Error ? err.message : "Unable to load projects");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  // Filter and group projects based on selected client
  const { filteredProjects, projectGroups, showGrouped } = useMemo(() => {
    let filtered: ProjectRecord[];

    if (selectedClientId === "all") {
      // Show all projects, sorted by client name then project name
      filtered = [...projects].sort((a, b) => {
        const clientCompare = (a.clientName ?? "").localeCompare(b.clientName ?? "");
        if (clientCompare !== 0) return clientCompare;
        return a.name.localeCompare(b.name);
      });

      // Group by client for display
      const groupMap = new Map<string, ProjectGroup>();
      for (const project of filtered) {
        const clientId = project.clientId;
        if (!groupMap.has(clientId)) {
          groupMap.set(clientId, {
            clientId,
            clientName: project.clientName ?? "Unknown Client",
            projects: [],
          });
        }
        groupMap.get(clientId)!.projects.push(project);
      }

      // Sort groups by client name
      const groups = Array.from(groupMap.values()).sort((a, b) =>
        a.clientName.localeCompare(b.clientName)
      );

      return { filteredProjects: filtered, projectGroups: groups, showGrouped: groups.length > 1 };
    } else {
      // Filter by selected client
      filtered = projects
        .filter(p => p.clientId === selectedClientId)
        .sort((a, b) => a.name.localeCompare(b.name));

      return { filteredProjects: filtered, projectGroups: [], showGrouped: false };
    }
  }, [projects, selectedClientId]);

  const title = selectedClientId === "all"
    ? "Tous les projets"
    : `Projets de ${selectedClient?.name ?? ""}`;

  const subtitle = selectedClientId === "all"
    ? "Accédez à tous les projets, triés par client."
    : "Accédez aux projets de ce client, inspectez le journey board et gérez les challenges.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{title}</h1>
          <p className="text-sm text-slate-300">{subtitle}</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadProjects()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Rafraîchir
        </Button>
      </div>

      {error ? (
        <Card className="border border-destructive/40 bg-destructive/10">
          <CardContent className="py-6 text-sm text-destructive-foreground">
            {error}. Essayez de rafraîchir la liste.
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Chargement des projets…
        </div>
      ) : null}

      {!isLoading && filteredProjects.length === 0 ? (
        <Card className="border border-dashed border-white/20 bg-slate-900/60">
          <CardContent className="py-12 text-center text-sm text-slate-300">
            {selectedClientId === "all"
              ? "Aucun projet n'a été créé. Utilisez le dashboard admin pour créer un premier projet."
              : "Aucun projet pour ce client. Utilisez le dashboard admin pour créer un projet."}
          </CardContent>
        </Card>
      ) : null}

      {!isLoading && showGrouped ? (
        // Grouped view when showing all clients
        <div className="space-y-8">
          {projectGroups.map(group => (
            <div key={group.clientId} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Building2 className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-medium text-white">{group.clientName}</h2>
                <span className="text-sm text-slate-400">
                  ({group.projects.length} projet{group.projects.length > 1 ? "s" : ""})
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.projects.map(project => (
                  <ProjectCard key={project.id} project={project} showClientName={false} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Flat view for single client
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map(project => (
            <ProjectCard key={project.id} project={project} showClientName={selectedClientId === "all"} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, showClientName }: { project: ProjectRecord; showClientName: boolean }) {
  return (
    <Card className="border border-white/10 bg-slate-900/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="flex items-center gap-2">
          <Folder className="h-5 w-5 text-indigo-300" />
          <CardTitle className="text-base text-white">{project.name}</CardTitle>
        </div>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs capitalize text-slate-200">
          {project.status}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-300">
        {showClientName && project.clientName ? (
          <p><span className="text-slate-400">Client:</span> {project.clientName}</p>
        ) : null}
        {project.description ? (
          <p className="line-clamp-3 text-slate-300">{project.description}</p>
        ) : (
          <p className="italic text-slate-400">Aucune description.</p>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <CalendarRange className="h-4 w-4" />
          <span>
            {formatDate(project.startDate)} → {formatDate(project.endDate)}
          </span>
        </div>
        <div className="pt-2">
          <Button asChild variant="secondary" className="w-full justify-center gap-2">
            <Link href={`/admin/projects/${project.id}`}>
              Voir le journey board
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
