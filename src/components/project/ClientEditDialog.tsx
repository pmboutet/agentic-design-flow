"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Building2, X } from "lucide-react";
import { ClientEditForm } from "@/components/admin/ClientEditForm";

interface ClientEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string | null;
  clientName?: string | null;
  onClientChange?: () => void;
  mode: "create" | "edit";
}

export function ClientEditDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onClientChange,
  mode
}: ClientEditDialogProps) {
  const handleSuccess = () => {
    onClientChange?.();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/20">
                  <Building2 className="h-5 w-5 text-indigo-300" />
                </div>
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">
                    {mode === "edit" ? "Edit Client" : "Create Client"}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-300">
                    {mode === "edit"
                      ? "Update the client information below"
                      : "Fill in the information to create a new client"}
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

            <div className="mt-6">
              <ClientEditForm
                clientId={clientId}
                clientName={clientName}
                mode={mode}
                onSuccess={handleSuccess}
                onCancel={handleCancel}
                fullPage={false}
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
