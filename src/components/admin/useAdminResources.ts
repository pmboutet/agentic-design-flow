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
    throw new Error(payload.error || payload.message || "Request failed");
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
      const results = await Promise.allSettled([
        request<ClientRecord[]>("/api/admin/clients"),
        request<ManagedUser[]>("/api/admin/users"),
        request<ProjectRecord[]>("/api/admin/projects"),
        request<ChallengeRecord[]>("/api/admin/challenges"),
        request<AskSessionRecord[]>("/api/admin/asks")
      ]);

      const [clientResult, userResult, projectResult, challengeResult, askResult] = results;
      const errors: string[] = [];

      if (clientResult.status === "fulfilled") {
        setClients(clientResult.value ?? []);
      } else {
        errors.push(
          clientResult.reason instanceof Error
            ? clientResult.reason.message
            : typeof clientResult.reason === "string"
              ? clientResult.reason
              : "Unable to load clients"
        );
      }

      if (userResult.status === "fulfilled") {
        setUsers(userResult.value ?? []);
      } else {
        errors.push(
          userResult.reason instanceof Error
            ? userResult.reason.message
            : typeof userResult.reason === "string"
              ? userResult.reason
              : "Unable to load users"
        );
      }

      if (projectResult.status === "fulfilled") {
        setProjects(projectResult.value ?? []);
      } else {
        errors.push(
          projectResult.reason instanceof Error
            ? projectResult.reason.message
            : typeof projectResult.reason === "string"
              ? projectResult.reason
              : "Unable to load projects"
        );
      }

      if (challengeResult.status === "fulfilled") {
        setChallenges(challengeResult.value ?? []);
      } else {
        errors.push(
          challengeResult.reason instanceof Error
            ? challengeResult.reason.message
            : typeof challengeResult.reason === "string"
              ? challengeResult.reason
              : "Unable to load challenges"
        );
      }

      if (askResult.status === "fulfilled") {
        setAsks(askResult.value ?? []);
      } else {
        errors.push(
          askResult.reason instanceof Error
            ? askResult.reason.message
            : typeof askResult.reason === "string"
              ? askResult.reason
              : "Unable to load ASK sessions"
        );
      }

      if (errors.length > 0) {
        setFeedback({
          type: "error",
          message: `Some data could not be loaded: ${Array.from(new Set(errors)).join(", ")}`
        });
      }

      setIsLoading(false);
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
        message: error instanceof Error ? error.message : "An error occurred"
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

  const refreshProjects = async () => {
    const data = await request<ProjectRecord[]>("/api/admin/projects");
    setProjects(data ?? []);
  };

  const refreshClients = async () => {
    const data = await request<ClientRecord[]>("/api/admin/clients");
    setClients(data ?? []);
  };

  const createClient = (values: ClientFormValues) =>
    handleAction(async () => {
      await request("/api/admin/clients", { method: "POST", body: JSON.stringify(values) });
      const data = await request<ClientRecord[]>("/api/admin/clients");
      setClients(data ?? []);
    }, "Client created successfully");

  const updateClient = (clientId: string, values: ClientFormValues) =>
    handleAction(async () => {
      await request(`/api/admin/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(values) });
      await refreshClients();
    }, "Client updated");

  const createUser = (values: UserFormValues) =>
    handleAction(async () => {
      await request("/api/admin/users", { method: "POST", body: JSON.stringify(values) });
      const data = await request<ManagedUser[]>("/api/admin/users");
      setUsers(data ?? []);
    }, "User created");

  const updateUser = (userId: string, values: Partial<UserFormValues>) =>
    handleAction(async () => {
      await request(`/api/admin/users/${userId}`, { method: "PATCH", body: JSON.stringify(values) });
      const data = await request<ManagedUser[]>("/api/admin/users");
      setUsers(data ?? []);
    }, "User updated");

  const createProject = (values: ProjectFormValues) =>
    handleAction(async () => {
      await request("/api/admin/projects", { method: "POST", body: JSON.stringify(values) });
      const data = await request<ProjectRecord[]>("/api/admin/projects");
      setProjects(data ?? []);
    }, "Project saved");

  const updateProject = (projectId: string, values: ProjectFormValues | Partial<ProjectFormValues>) =>
    handleAction(async () => {
      await request(`/api/admin/projects/${projectId}`, { method: "PATCH", body: JSON.stringify(values) });
      await refreshProjects();
    }, "Project updated");

  const updateChallenge = (challengeId: string, values: ChallengeFormValues) =>
    handleAction(async () => {
      await request(`/api/admin/challenges/${challengeId}`, { method: "PATCH", body: JSON.stringify(values) });
      await refreshChallenges();
    }, "Challenge updated");

  const createAsk = (values: AskCreateFormValues & { projectId: string }) =>
    handleAction(async () => {
      await request("/api/admin/asks", { method: "POST", body: JSON.stringify(values) });
      await refreshAsks();
    }, "ASK session created");

  const updateAsk = (askId: string, values: Omit<AskEditFormValues, "askId">) =>
    handleAction(async () => {
      await request(`/api/admin/asks/${askId}`, { method: "PATCH", body: JSON.stringify(values) });
      await refreshAsks();
    }, "ASK session updated");

  const deleteClient = (clientId: string) =>
    handleAction(async () => {
      await request(`/api/admin/clients/${clientId}`, { method: "DELETE" });
      await Promise.all([refreshClients(), refreshProjects(), refreshChallenges(), refreshAsks()]);
    }, "Client removed");

  const deleteProject = (projectId: string) =>
    handleAction(async () => {
      await request(`/api/admin/projects/${projectId}`, { method: "DELETE" });
      await Promise.all([refreshProjects(), refreshChallenges(), refreshAsks()]);
    }, "Project removed");

  const deleteChallenge = (challengeId: string) =>
    handleAction(async () => {
      await request(`/api/admin/challenges/${challengeId}`, { method: "DELETE" });
      await Promise.all([refreshChallenges(), refreshAsks()]);
    }, "Challenge removed");

  const deleteAsk = (askId: string) =>
    handleAction(async () => {
      await request(`/api/admin/asks/${askId}`, { method: "DELETE" });
      await refreshAsks();
    }, "ASK session removed");

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
    updateClient,
    createUser,
    updateUser,
    createProject,
    updateProject,
    updateChallenge,
    createAsk,
    updateAsk,
    deleteClient,
    deleteProject,
    deleteChallenge,
    deleteAsk
  };
}
