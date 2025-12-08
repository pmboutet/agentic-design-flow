"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AskSessionRecord, type ChallengeRecord, type ManagedUser, type ProjectRecord } from "@/types";
import { AskCreateForm, type AskCreateFormValues } from "./AskCreateForm";
import { AskEditForm, type AskEditFormValues } from "./AskEditForm";

interface AskManagerProps {
  challenges: ChallengeRecord[];
  projects: ProjectRecord[];
  asks: AskSessionRecord[];
  users: ManagedUser[];
  onCreate: (values: AskCreateFormValues & { projectId: string }) => Promise<void>;
  onUpdate: (askId: string, values: Omit<AskEditFormValues, "askId">) => Promise<void>;
  isLoading?: boolean;
}

export function AskManager({ challenges, projects, asks, users, onCreate, onUpdate, isLoading }: AskManagerProps) {
  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>ASK Sessions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h4 className="font-semibold text-sm text-muted-foreground">Create a new session</h4>
            <AskCreateForm
              challenges={challenges}
              projects={projects}
              availableUsers={users}
              onSubmit={onCreate}
              isLoading={isLoading}
            />
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold text-sm text-muted-foreground">Edit a session</h4>
            <AskEditForm
              asks={asks}
              availableUsers={users}
              onSubmit={onUpdate}
              isLoading={isLoading}
            />
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground">Existing ASK sessions</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {asks.length === 0 && (
              <p className="text-sm text-muted-foreground">No ASK sessions registered yet.</p>
            )}
            {asks.map(ask => (
              <div key={ask.id} className="neumorphic-shadow p-3 rounded-lg bg-white/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{ask.name}</p>
                    <p className="text-xs text-muted-foreground">{ask.askKey}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary capitalize">
                    {ask.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(ask.startDate).toLocaleString()} → {new Date(ask.endDate).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
