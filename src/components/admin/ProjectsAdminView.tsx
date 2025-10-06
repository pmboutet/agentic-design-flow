"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, Folder, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ProjectRecord } from "@/types";

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

export function ProjectsAdminView() {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Projects overview</h1>
          <p className="text-sm text-slate-300">
            Access every project, inspect its journey board and jump directly into challenge curation.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => void loadProjects()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="border border-destructive/40 bg-destructive/10">
          <CardContent className="py-6 text-sm text-destructive-foreground">
            {error}. Try refreshing the list.
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading projects…
        </div>
      ) : null}

      {!isLoading && projects.length === 0 ? (
        <Card className="border border-dashed border-white/20 bg-slate-900/60">
          <CardContent className="py-12 text-center text-sm text-slate-300">
            No projects have been registered yet. Use the admin dashboard to create a first project.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map(project => (
          <Card key={project.id} className="border border-white/10 bg-slate-900/70">
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
              {project.clientName ? (
                <p><span className="text-slate-400">Client:</span> {project.clientName}</p>
              ) : null}
              {project.description ? (
                <p className="line-clamp-3 text-slate-300">{project.description}</p>
              ) : (
                <p className="italic text-slate-400">No description provided.</p>
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
                    View journey board
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

