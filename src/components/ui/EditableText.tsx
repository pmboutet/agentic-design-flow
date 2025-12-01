"use client";

import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
}

export function EditableText({
  value,
  onChange,
  placeholder = "Click to edit...",
  className,
  textClassName,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      adjustHeight();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  if (isEditing && !disabled) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          adjustHeight();
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          "w-full resize-none rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-600",
          className
        )}
        style={{ minHeight: "40px" }}
      />
    );
  }

  return (
    <div
      onClick={() => !disabled && setIsEditing(true)}
      className={cn(
        "group relative w-full cursor-pointer rounded-md border border-transparent px-3 py-2 transition-colors hover:border-slate-700 hover:bg-slate-900/50",
        disabled && "cursor-not-allowed opacity-60",
        textClassName
      )}
    >
      <span className={cn("text-sm", value ? "text-slate-200" : "text-slate-500")}>
        {value || placeholder}
      </span>
      {!disabled && (
        <Pencil className="absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  );
}
