"use client";

import { useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FolderKanban, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectContext } from "./ProjectContext";
import { useClientContext } from "./ClientContext";

interface ProjectSelectorProps {
  collapsed?: boolean;
}

export function ProjectSelector({ collapsed = false }: ProjectSelectorProps) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    selectedProjectId,
    setSelectedProjectId,
    projects,
    allProjects,
    isLoading,
    hasMultipleProjects,
  } = useProjectContext();
  const { setSelectedClientId } = useClientContext();

  // Check if we're on a project-related page
  const isOnProjectDetailPage = useMemo(() => {
    const match = pathname.match(/^\/admin\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const isOnProjectsListPage = pathname === "/admin/projects";

  // Handle project selection change with navigation
  const handleProjectChange = useCallback((newProjectId: string) => {
    setSelectedProjectId(newProjectId);

    // Auto-select the corresponding client when a specific project is selected
    if (newProjectId !== "all") {
      const project = allProjects.find(p => p.id === newProjectId);
      if (project?.clientId) {
        setSelectedClientId(project.clientId);
      }
      // Navigate to journey board when a specific project is selected
      router.push(`/admin/projects/${newProjectId}`);
    } else if (isOnProjectsListPage || isOnProjectDetailPage) {
      // Go back to projects list only when "all" is selected and on projects pages
      router.push("/admin/projects");
    }
  }, [setSelectedProjectId, allProjects, setSelectedClientId, isOnProjectsListPage, isOnProjectDetailPage, router]);

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2",
        collapsed ? "justify-center" : ""
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        {!collapsed && <span className="text-sm text-slate-400">Chargement...</span>}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2",
        collapsed ? "justify-center" : ""
      )}>
        <FolderKanban className="h-4 w-4 text-slate-500" />
        {!collapsed && <span className="text-sm text-slate-400">Aucun projet</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!collapsed && (
        <div className="text-xs font-medium uppercase tracking-wider text-slate-400 px-1">
          Projet
        </div>
      )}
      <div className="relative">
        <select
          value={selectedProjectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          className={cn(
            "w-full appearance-none rounded-xl border border-white/10 bg-white/5 text-sm text-white transition",
            "hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/50",
            "cursor-pointer",
            collapsed ? "px-2 py-2 pr-6" : "px-3 py-2 pr-8"
          )}
          aria-label="Sélectionner un projet"
        >
          {hasMultipleProjects && (
            <option value="all" className="bg-slate-900">
              {collapsed ? "Tous" : "Tous les projets"}
            </option>
          )}
          {projects.map(project => (
            <option key={project.id} value={project.id} className="bg-slate-900">
              {collapsed ? project.name.slice(0, 3) : project.name}
            </option>
          ))}
        </select>
        <ChevronDown className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400",
          collapsed ? "right-1" : "right-2"
        )} />
      </div>
    </div>
  );
}
