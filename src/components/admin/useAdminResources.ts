"use client";

import { useEffect, useState } from "react";
import { type ClientFormValues } from "./ClientManager";
import { type UserFormValues } from "./UserManager";
import { type ProjectFormValues } from "./ProjectManager";
import { type ChallengeFormValues } from "./ChallengeEditor";
import { type AskCreateFormValues } from "./AskCreateForm";
import { type AskEditFormValues } from "./AskEditForm";
import {
  type AskSessionRecord,
  type ChallengeRecord,
  type ClientRecord,
  type ManagedUser,
  type ProjectRecord
} from "@/types";

export interface FeedbackState {
  type: "success" | "error";
  message: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || payload.message || "Requête échouée");
  }
  return payload.data as T;
}

export function useAdminResources() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [challenges, setChallenges] = useState<ChallengeRecord[]>([]);
  const [asks, setAsks] = useState<AskSessionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [clientData, userData, projectData, challengeData, askData] = await Promise.all([
          request<ClientRecord[]>("/api/admin/clients"),
          request<ManagedUser[]>("/api/admin/users"),
          request<ProjectRecord[]>("/api/admin/projects"),
          request<ChallengeRecord[]>("/api/admin/challenges"),
          request<AskSessionRecord[]>("/api/admin/asks")
        ]);

        setClients(clientData ?? []);
        setUsers(userData ?? []);
        setProjects(projectData ?? []);
        setChallenges(challengeData ?? []);
        setAsks(askData ?? []);
      } catch (error) {
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "Chargement impossible"
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadInitial();
  }, []);

  const handleAction = async (action: () => Promise<void>, successMessage: string) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      await action();
      setFeedback({ type: "success", message: successMessage });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Une erreur est survenue"
      });
    } finally {
      setIsBusy(false);
    }
  };

  const refreshChallenges = async () => {
    const data = await request<ChallengeRecord[]>("/api/admin/challenges");
    setChallenges(data ?? []);
  };

  const refreshAsks = async () => {
    const data = await request<AskSessionRecord[]>("/api/admin/asks");
    setAsks(data ?? []);
  };

  const createClient = (values: ClientFormValues) =>
    handleAction(async () => {
      await request("/api/admin/clients", { method: "POST", body: JSON.stringify(values) });
      const data = await request<ClientRecord[]>("/api/admin/clients");
      setClients(data ?? []);
    }, "Client créé avec succès");

  const createUser = (values: UserFormValues) =>
    handleAction(async () => {
      await request("/api/admin/users", { method: "POST", body: JSON.stringify(values) });
      const data = await request<ManagedUser[]>("/api/admin/users");
      setUsers(data ?? []);
    }, "Utilisateur créé");

  const createProject = (values: ProjectFormValues) =>
    handleAction(async () => {
      await request("/api/admin/projects", { method: "POST", body: JSON.stringify(values) });
      const data = await request<ProjectRecord[]>("/api/admin/projects");
      setProjects(data ?? []);
    }, "Projet enregistré");

  const updateChallenge = (challengeId: string, values: ChallengeFormValues) =>
    handleAction(async () => {
      await request(`/api/admin/challenges/${challengeId}`, { method: "PATCH", body: JSON.stringify(values) });
      await refreshChallenges();
    }, "Challenge mis à jour");

  const createAsk = (values: AskCreateFormValues & { projectId: string }) =>
    handleAction(async () => {
      await request("/api/admin/asks", { method: "POST", body: JSON.stringify(values) });
      await refreshAsks();
    }, "Session ASK créée");

  const updateAsk = (askId: string, values: Omit<AskEditFormValues, "askId">) =>
    handleAction(async () => {
      await request(`/api/admin/asks/${askId}`, { method: "PATCH", body: JSON.stringify(values) });
      await refreshAsks();
    }, "Session ASK mise à jour");

  return {
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
    createUser,
    createProject,
    updateChallenge,
    createAsk,
    updateAsk
  };
}
