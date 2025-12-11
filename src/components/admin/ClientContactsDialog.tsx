"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Plus, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientMember, ClientRole, ManagedUser } from "@/types";

const clientRoles: ClientRole[] = ["client_admin", "facilitator", "manager", "participant"];

const addContactSchema = z.object({
  userId: z.string().uuid("Please select a user"),
  role: z.enum(["client_admin", "facilitator", "manager", "participant"]).default("participant"),
  jobTitle: z.string().trim().max(255).optional().or(z.literal(""))
});

type AddContactFormValues = z.infer<typeof addContactSchema>;

interface ClientContactsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  clientName: string | null;
}

interface ContactWithProfile extends ClientMember {
  profile?: {
    email: string;
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export function ClientContactsDialog({
  open,
  onOpenChange,
  clientId,
  clientName
}: ClientContactsDialogProps) {
  const [contacts, setContacts] = useState<ContactWithProfile[]>([]);
  const [availableUsers, setAvailableUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const form = useForm<AddContactFormValues>({
    resolver: zodResolver(addContactSchema),
    defaultValues: {
      userId: "",
      role: "participant",
      jobTitle: ""
    }
  });

  const loadContacts = useCallback(async () => {
    if (!clientId) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/clients/${clientId}/members`, {
        credentials: "include"
      });
      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to load contacts");
      }

      const members: ClientMember[] = payload.data || [];

      // Fetch user profiles for each member
      const contactsWithProfiles: ContactWithProfile[] = await Promise.all(
        members.map(async (member) => {
          try {
            const profileRes = await fetch(`/api/admin/profiles/${member.userId}`, {
              credentials: "include"
            });
            const profilePayload = await profileRes.json();
            if (profilePayload.success && profilePayload.data) {
              return {
                ...member,
                profile: {
                  email: profilePayload.data.email,
                  fullName: profilePayload.data.fullName,
                  firstName: profilePayload.data.firstName,
                  lastName: profilePayload.data.lastName
                }
              };
            }
          } catch {
            // Ignore profile fetch errors
          }
          return member;
        })
      );

      setContacts(contactsWithProfiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  const loadAvailableUsers = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/profiles", {
        credentials: "include"
      });
      const payload = await response.json();

      if (payload.success && payload.data) {
        setAvailableUsers(payload.data);
      }
    } catch {
      // Ignore errors loading users
    }
  }, []);

  useEffect(() => {
    if (open && clientId) {
      setError(null);
      setShowAddForm(false);
      form.reset();
      void loadContacts();
      void loadAvailableUsers();
    }
  }, [open, clientId, loadContacts, loadAvailableUsers, form]);

  const handleAddContact = async (values: AddContactFormValues) => {
    if (!clientId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/clients/${clientId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values)
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to add contact");
      }

      await loadContacts();
      setShowAddForm(false);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveContact = async (userId: string) => {
    if (!clientId) return;
    if (!window.confirm("Remove this contact from the client?")) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/clients/${clientId}/members/${userId}`, {
        method: "DELETE",
        credentials: "include"
      });

      const payload = await response.json();

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Failed to remove contact");
      }

      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDisplayName = (contact: ContactWithProfile): string => {
    if (contact.profile?.fullName) return contact.profile.fullName;
    if (contact.profile?.firstName || contact.profile?.lastName) {
      return [contact.profile.firstName, contact.profile.lastName].filter(Boolean).join(" ");
    }
    if (contact.profile?.email) return contact.profile.email;
    return contact.userId;
  };

  // Filter out users who are already contacts
  const contactUserIds = new Set(contacts.map(c => c.userId));
  const filteredAvailableUsers = availableUsers.filter(u => !contactUserIds.has(u.id));

  const getRoleLabel = (role: ClientRole): string => {
    const labels: Record<ClientRole, string> = {
      client_admin: "Client Admin",
      facilitator: "Facilitator",
      manager: "Manager",
      participant: "Participant"
    };
    return labels[role] || role;
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
                  <Users className="h-5 w-5 text-indigo-300" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">
                    Contacts - {clientName}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-300">
                    Manage contacts associated with this client
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}

            {/* Add Contact Form */}
            <div className="mt-6">
              {!showAddForm ? (
                <Button
                  type="button"
                  variant="glassDark"
                  className="gap-2"
                  onClick={() => setShowAddForm(true)}
                  disabled={isSubmitting || filteredAvailableUsers.length === 0}
                >
                  <Plus className="h-4 w-4" />
                  Add Contact
                </Button>
              ) : (
                <form
                  onSubmit={form.handleSubmit(handleAddContact)}
                  className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-4"
                >
                  <p className="text-sm font-medium text-indigo-300">Add new contact</p>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="contact-user" className="text-slate-200">
                        User <span className="text-rose-400">*</span>
                      </Label>
                      <select
                        id="contact-user"
                        {...form.register("userId")}
                        disabled={isSubmitting}
                        className="h-10 rounded-md border border-white/20 bg-slate-800/80 px-3 text-sm text-white"
                      >
                        <option value="">Select a user...</option>
                        {filteredAvailableUsers.map(user => (
                          <option key={user.id} value={user.id}>
                            {user.fullName || user.email} {user.email && user.fullName ? `(${user.email})` : ""}
                          </option>
                        ))}
                      </select>
                      {form.formState.errors.userId && (
                        <p className="text-sm text-rose-400">{form.formState.errors.userId.message}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="contact-role" className="text-slate-200">Role</Label>
                      <select
                        id="contact-role"
                        {...form.register("role")}
                        disabled={isSubmitting}
                        className="h-10 rounded-md border border-white/20 bg-slate-800/80 px-3 text-sm text-white"
                      >
                        {clientRoles.map(role => (
                          <option key={role} value={role}>
                            {getRoleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <Label htmlFor="contact-job-title" className="text-slate-200">Job Title</Label>
                      <Input
                        id="contact-job-title"
                        {...form.register("jobTitle")}
                        placeholder="e.g. Project Manager"
                        disabled={isSubmitting}
                        className="border-white/20 bg-slate-800/80 text-white placeholder:text-slate-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="glassDark"
                      onClick={() => {
                        setShowAddForm(false);
                        form.reset();
                      }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="glassDark"
                      disabled={isSubmitting}
                      className="gap-2 bg-indigo-600 hover:bg-indigo-500"
                    >
                      {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      Add Contact
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Contacts List */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-slate-300 mb-3">
                Current Contacts ({contacts.length})
              </h4>

              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading contacts...
                </div>
              ) : contacts.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">
                  No contacts associated with this client yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {contacts.map(contact => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {getDisplayName(contact)}
                        </p>
                        {contact.profile?.email && contact.profile.fullName && (
                          <p className="text-xs text-slate-400 truncate">{contact.profile.email}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                            {getRoleLabel(contact.role)}
                          </span>
                          {contact.jobTitle && (
                            <span className="text-[10px] text-slate-500">
                              {contact.jobTitle}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleRemoveContact(contact.userId)}
                        className="ml-3 flex items-center gap-1 text-xs text-red-300 hover:text-red-200"
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Close button */}
            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                variant="glassDark"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
