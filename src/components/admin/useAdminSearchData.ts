"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { AskSessionRecord, ChallengeRecord, ClientRecord, ManagedUser, ProjectRecord } from "@/types";
import type { SearchResultItem } from "./AdminSearchContext";

interface SearchData {
  clients: ClientRecord[];
  projects: ProjectRecord[];
  challenges: ChallengeRecord[];
  asks: AskSessionRecord[];
  users: ManagedUser[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.success) {
      return null;
    }
    return payload.data as T;
  } catch {
    return null;
  }
}

export function useAdminSearchData() {
  const [data, setData] = useState<SearchData>({
    clients: [],
    projects: [],
    challenges: [],
    asks: [],
    users: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const isLoadingRef = useRef(false);

  useEffect(() => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    const loadData = async () => {
      try {
        const [clients, projects, challenges, asks, users] = await Promise.all([
          fetchJson<ClientRecord[]>("/api/admin/clients"),
          fetchJson<ProjectRecord[]>("/api/admin/projects"),
          fetchJson<ChallengeRecord[]>("/api/admin/challenges"),
          fetchJson<AskSessionRecord[]>("/api/admin/asks"),
          fetchJson<ManagedUser[]>("/api/admin/profiles")
        ]);

        setData({
          clients: clients ?? [],
          projects: projects ?? [],
          challenges: challenges ?? [],
          asks: asks ?? [],
          users: users ?? []
        });
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    };

    void loadData();
  }, []);

  // Build lookup maps
  const clientById = useMemo(
    () => new Map(data.clients.map(c => [c.id, c])),
    [data.clients]
  );

  const projectById = useMemo(
    () => new Map(data.projects.map(p => [p.id, p])),
    [data.projects]
  );

  const challengeById = useMemo(
    () => new Map(data.challenges.map(c => [c.id, c])),
    [data.challenges]
  );

  // Search function that filters across all entities
  const search = useCallback((query: string): SearchResultItem[] => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const results: SearchResultItem[] = [];
    const seen = new Set<string>();

    const addResult = (item: SearchResultItem) => {
      const key = `${item.type}-${item.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(item);
      }
    };

    const matchesText = (text: string | null | undefined): boolean =>
      !!text && text.toLowerCase().includes(normalizedQuery);

    // Search clients
    for (const client of data.clients) {
      if (
        matchesText(client.name) ||
        matchesText(client.company) ||
        matchesText(client.email)
      ) {
        addResult({
          id: client.id,
          type: "client",
          title: client.name,
          subtitle: [client.company, client.industry].filter(Boolean).join(" • ") || undefined
        });
      }
    }

    // Search projects
    for (const project of data.projects) {
      const client = project.clientId ? clientById.get(project.clientId) : null;
      if (
        matchesText(project.name) ||
        matchesText(project.description) ||
        matchesText(client?.name)
      ) {
        addResult({
          id: project.id,
          type: "project",
          title: project.name,
          subtitle: client?.name || undefined,
          clientId: project.clientId ?? null
        });
      }
    }

    // Search challenges
    for (const challenge of data.challenges) {
      const project = challenge.projectId ? projectById.get(challenge.projectId) : null;
      const client = project?.clientId ? clientById.get(project.clientId) : null;
      if (
        matchesText(challenge.name) ||
        matchesText(challenge.description) ||
        matchesText(challenge.category)
      ) {
        addResult({
          id: challenge.id,
          type: "challenge",
          title: challenge.name,
          subtitle: [project?.name, client?.name].filter(Boolean).join(" • ") || undefined,
          clientId: client?.id ?? null,
          projectId: challenge.projectId ?? null
        });
      }
    }

    // Search ASK sessions
    for (const ask of data.asks) {
      const challenge = ask.challengeId ? challengeById.get(ask.challengeId) : null;
      const project = challenge?.projectId ? projectById.get(challenge.projectId) : null;
      const client = project?.clientId ? clientById.get(project.clientId) : null;
      if (
        matchesText(ask.name) ||
        matchesText(ask.question) ||
        matchesText(ask.description) ||
        matchesText(ask.askKey)
      ) {
        addResult({
          id: ask.id,
          type: "ask",
          title: ask.name || ask.askKey,
          subtitle: [challenge?.name, project?.name].filter(Boolean).join(" • ") || undefined,
          clientId: client?.id ?? null,
          projectId: project?.id ?? null,
          challengeId: ask.challengeId ?? null
        });
      }
    }

    // Search users
    for (const user of data.users) {
      const nameValue = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ");
      const client = user.clientId ? clientById.get(user.clientId) : null;
      if (
        matchesText(nameValue) ||
        matchesText(user.email) ||
        matchesText(user.role) ||
        matchesText(client?.name)
      ) {
        addResult({
          id: user.id,
          type: "user",
          title: nameValue || user.email,
          subtitle: [user.role, client?.name].filter(Boolean).join(" • ") || undefined,
          clientId: user.clientId ?? null
        });
      }
    }

    return results.slice(0, 20);
  }, [data, clientById, projectById, challengeById]);

  return {
    isLoading,
    search,
    ...data
  };
}
