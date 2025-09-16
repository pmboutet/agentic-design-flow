"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type ClientRecord, type ManagedUser } from "@/types";

const roles = ["full_admin", "project_admin", "facilitator", "manager", "participant", "user"] as const;

const formSchema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  firstName: z.string().trim().max(100).optional().or(z.literal("")),
  lastName: z.string().trim().max(100).optional().or(z.literal("")),
  role: z.enum(roles),
  clientId: z.string().trim().optional(),
  isActive: z.boolean().default(true)
});

export type UserFormValues = z.infer<typeof formSchema>;

interface UserManagerProps {
  clients: ClientRecord[];
  users: ManagedUser[];
  onCreate: (values: UserFormValues) => Promise<void>;
  isLoading?: boolean;
}

export function UserManager({ clients, users, onCreate, isLoading }: UserManagerProps) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: "user",
      clientId: "",
      isActive: true
    }
  });

  const handleSubmit = async (values: UserFormValues) => {
    await onCreate(values);
    form.reset({ email: "", firstName: "", lastName: "", role: "user", clientId: "", isActive: true });
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Utilisateurs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="user-email">Email</Label>
            <Input id="user-email" type="email" {...form.register("email")}
              placeholder="utilisateur@client.com" disabled={isLoading} />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="user-first">Prénom</Label>
            <Input id="user-first" {...form.register("firstName")}
              placeholder="Prénom" disabled={isLoading} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="user-last">Nom</Label>
            <Input id="user-last" {...form.register("lastName")}
              placeholder="Nom" disabled={isLoading} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="user-role">Rôle</Label>
            <select id="user-role" {...form.register("role")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm" disabled={isLoading}>
              {roles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="user-client">Client</Label>
            <select id="user-client" {...form.register("clientId")}
              className="h-10 rounded-md border border-border bg-white/70 px-3 text-sm" disabled={isLoading}>
              <option value="">Aucun</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input id="user-active" type="checkbox" className="h-4 w-4"
              {...form.register("isActive")}
              disabled={isLoading} />
            <Label htmlFor="user-active">Actif</Label>
          </div>

          <div className="md:col-span-3 flex justify-end">
            <Button type="submit" className="neumorphic-raised" disabled={isLoading}>
              Créer l'utilisateur
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground">Derniers utilisateurs</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {users.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun utilisateur enregistré pour le moment.</p>
            )}
            {users.map(user => (
              <div key={user.id} className="neumorphic-shadow p-3 rounded-lg bg-white/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{user.fullName || user.email}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-secondary text-secondary-foreground capitalize">
                    {user.role.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{user.clientName || "Sans client"}</span>
                  <span>{user.isActive ? "Actif" : "Inactif"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
