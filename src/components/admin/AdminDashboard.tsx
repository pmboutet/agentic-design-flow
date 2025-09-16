"use client";

import { motion } from "framer-motion";
import { Building2, ClipboardList, MessageSquare, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ClientManager } from "./ClientManager";
import { UserManager } from "./UserManager";
import { ProjectManager } from "./ProjectManager";
import { ChallengeEditor } from "./ChallengeEditor";
import { AskManager } from "./AskManager";
import { useAdminResources } from "./useAdminResources";

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
    createUser,
    createProject,
    updateChallenge,
    createAsk,
    updateAsk
  } = useAdminResources();

  const stats = [
    { label: "Clients", value: clients.length, icon: Building2 },
    { label: "Utilisateurs", value: users.length, icon: Users },
    { label: "Projets", value: projects.length, icon: ClipboardList },
    { label: "ASK", value: asks.length, icon: MessageSquare }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-200">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="app-header border-0 sticky top-0 z-40"
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Backoffice Agentic Design Flow
              </h1>
              <p className="text-sm text-muted-foreground">Gestion centralisée des clients, projets, challenges et sessions ASK</p>
            </div>
          </div>
        </div>
      </motion.header>

      <main className="container mx-auto space-y-8 px-6 py-6">
        {feedback && (
          <Alert
            variant={feedback.type === "error" ? "destructive" : "default"}
            className="flex items-start justify-between"
          >
            <AlertDescription>{feedback.message}</AlertDescription>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs text-muted-foreground underline"
            >
              Fermer
            </button>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <div key={label} className="neumorphic-shadow rounded-2xl bg-white/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{value}</p>
                </div>
                <Icon className="h-8 w-8 text-primary" />
              </div>
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground">Chargement des données...</div>
        ) : (
          <div className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <ClientManager clients={clients} onCreate={createClient} isLoading={isBusy} />
              <UserManager clients={clients} users={users} onCreate={createUser} isLoading={isBusy} />
            </div>

            <ProjectManager
              clients={clients}
              users={users}
              projects={projects}
              onCreate={createProject}
              isLoading={isBusy}
            />

            <div className="grid gap-6 md:grid-cols-2">
              <ChallengeEditor challenges={challenges} users={users} onSave={updateChallenge} isLoading={isBusy} />
              <AskManager
                challenges={challenges}
                asks={asks}
                onCreate={createAsk}
                onUpdate={updateAsk}
                isLoading={isBusy}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
