"use client";

import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type ClientRecord } from "@/types";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  industry: z.string().trim().max(100).optional().or(z.literal(""))
});

export type ClientFormValues = z.infer<typeof formSchema>;

interface ClientManagerProps {
  clients: ClientRecord[];
  onCreate: (values: ClientFormValues) => Promise<void>;
  isLoading?: boolean;
}

export function ClientManager({ clients, onCreate, isLoading }: ClientManagerProps) {
  const form = useForm<ClientFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "", company: "", industry: "" }
  });

  const handleSubmit = async (values: ClientFormValues) => {
    await onCreate(values);
    form.reset();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Clients</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="client-name">Name</Label>
            <Input
              id="client-name"
              {...form.register("name")}
              placeholder="TechCorp Solutions"
              disabled={isLoading}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-email">Email</Label>
            <Input id="client-email" type="email" {...form.register("email")}
              placeholder="contact@client.com" disabled={isLoading} />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-company">Company</Label>
            <Input
              id="client-company"
              {...form.register("company")}
              placeholder="Company name"
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="client-industry">Industry</Label>
            <Input
              id="client-industry"
              {...form.register("industry")}
              placeholder="Industry"
              disabled={isLoading}
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" className="neumorphic-raised" disabled={isLoading}>
              Add client
            </Button>
          </div>
        </form>

        <div className="space-y-3">
          <h4 className="font-semibold text-sm text-muted-foreground">Existing clients</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {clients.length === 0 && (
              <p className="text-sm text-muted-foreground">No clients registered yet.</p>
            )}
            {clients.map(client => (
              <div key={client.id} className="neumorphic-shadow p-3 rounded-lg bg-white/60">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.email || "Email not provided"}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {client.status}
                  </span>
                </div>
                {(client.company || client.industry) && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {[client.company, client.industry].filter(Boolean).join(" • ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
