"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ManagedUser } from "@/types";

interface UserSearchComboboxProps {
  users: ManagedUser[];
  selectedUserId?: string | null;
  onSelect: (user: ManagedUser | null) => void;
  onCreateNew?: (email: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function UserSearchCombobox({
  users,
  selectedUserId,
  onSelect,
  onCreateNew,
  placeholder = "Rechercher un utilisateur...",
  disabled = false,
  className
}: UserSearchComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selectedUser = React.useMemo(
    () => users.find(user => user.id === selectedUserId),
    [users, selectedUserId]
  );

  const filteredUsers = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return users.slice(0, 50); // Limite initiale
    }

    const query = searchQuery.toLowerCase().trim();
    return users.filter(user => {
      const fullName = (user.fullName || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const jobTitle = (user.jobTitle || "").toLowerCase();
      return fullName.includes(query) || email.includes(query) || jobTitle.includes(query);
    }).slice(0, 50); // Limite de résultats
  }, [users, searchQuery]);

  const handleSelect = (user: ManagedUser) => {
    onSelect(user);
    setOpen(false);
    setSearchQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearchQuery("");
    setOpen(false);
  };

  React.useEffect(() => {
    if (open && inputRef.current) {
      // Petit délai pour s'assurer que le popover est rendu
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between h-10 rounded-xl border border-white/10 bg-slate-900/60 text-white hover:bg-slate-800/60",
            !selectedUser && "text-slate-400",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
          disabled={disabled}
        >
          {selectedUser ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="truncate">
                {selectedUser.fullName || selectedUser.email}
              </span>
              {selectedUser.jobTitle && (
                <span className="text-xs text-slate-500 truncate">
                  ({selectedUser.jobTitle})
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
          <div className="flex items-center gap-1">
            {selectedUser && !disabled && (
              <X
                className="h-4 w-4 shrink-0 text-slate-400 hover:text-white"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b border-white/10 px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 border-0 bg-transparent text-white placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "Enter" && filteredUsers.length === 1) {
                handleSelect(filteredUsers[0]!);
              }
            }}
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filteredUsers.length === 0 ? (
            <div className="py-4">
              <div className="py-2 text-center text-sm text-slate-400">
                {searchQuery.trim() ? "Aucun utilisateur trouvé" : "Aucun utilisateur"}
              </div>
              {onCreateNew && (
                <button
                  type="button"
                  onClick={() => {
                    const emailToCreate = searchQuery.trim() || "nouveau@exemple.com";
                    onCreateNew(emailToCreate);
                    setSearchQuery("");
                    setOpen(false);
                  }}
                  className="w-full rounded-lg border border-slate-500/30 bg-slate-500/10 px-3 py-2 text-sm text-white transition-colors hover:bg-slate-500/20"
                >
                  {searchQuery.trim() ? `Créer "${searchQuery}"` : "Create"}
                </button>
              )}
            </div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleSelect(user)}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-lg px-2 py-2 text-sm outline-none transition-colors",
                  "hover:bg-white/10 focus:bg-white/10",
                  selectedUserId === user.id && "bg-indigo-500/20"
                )}
              >
                <div className="flex flex-col gap-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">
                      {user.fullName || user.email}
                    </span>
                    {selectedUserId === user.id && (
                      <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="truncate">{user.email}</span>
                    {user.jobTitle && (
                      <>
                        <span>•</span>
                        <span className="truncate">{user.jobTitle}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
