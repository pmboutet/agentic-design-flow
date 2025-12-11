"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ChallengeRecord } from "@/types";
import { formatDateTime, formatDisplayValue } from "../utils";

export interface ChallengeDetailDialogProps {
  challenge: ChallengeRecord | null;
  projectName?: string | null;
  askCount: number;
  onClose: () => void;
}

export function ChallengeDetailDialog({ challenge, projectName, askCount, onClose }: ChallengeDetailDialogProps) {
  return (
    <Dialog.Root open={Boolean(challenge)} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm transition-opacity data-[state=closed]:opacity-0 data-[state=open]:opacity-100" />
        <Dialog.Content className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {challenge && (
            <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl my-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Dialog.Title className="text-lg font-semibold text-white">{challenge.name}</Dialog.Title>
                  <Dialog.Description className="text-sm text-slate-300">
                    Challenge lié au projet {formatDisplayValue(projectName)}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/10 p-1.5 text-slate-200 transition hover:bg-white/20"
                    aria-label="Fermer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>

              {challenge.description && (
                <p className="mt-4 text-sm leading-relaxed text-slate-200">{challenge.description}</p>
              )}

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Statut</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.status)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Priorité</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.priority)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Catégorie</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.category)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Responsable</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(challenge.assignedTo)}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Échéance</p>
                  <p className="mt-1 text-sm font-medium text-white">{formatDisplayValue(formatDateTime(challenge.dueDate))}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Sessions ASK reliées</p>
                  <p className="mt-1 text-sm font-medium text-white">{askCount}</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wide text-slate-400">Dernière mise à jour</p>
                <p className="mt-1 font-medium text-white">{formatDisplayValue(formatDateTime(challenge.updatedAt))}</p>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
