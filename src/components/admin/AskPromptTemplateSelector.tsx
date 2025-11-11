"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type AskPromptTemplate, type ApiResponse } from "@/types";
import { Loader2 } from "lucide-react";

interface AskPromptTemplateSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function AskPromptTemplateSelector({
  value,
  onChange,
  disabled = false,
}: AskPromptTemplateSelectorProps) {
  const [templates, setTemplates] = useState<AskPromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  useEffect(() => {
    async function loadTemplates() {
      try {
        const response = await fetch("/api/admin/ask-prompt-templates", {
          credentials: "include",
        });
        const data: ApiResponse<AskPromptTemplate[]> = await response.json();
        
        if (data.success && data.data) {
          setTemplates(data.data);
        } else {
          console.error("Failed to load templates:", data.error);
        }
      } catch (error) {
        console.error("Failed to load templates:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadTemplates();
  }, []);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        onChange(template.systemPrompt);
      }
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading templates...</span>
      </div>
    );
  }

  if (templates.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="template-select" className="text-sm font-medium">
          Template de prompt
        </Label>
        <select
          id="template-select"
          value={selectedTemplateId}
          onChange={(e) => handleTemplateSelect(e.target.value)}
          disabled={disabled}
          className="h-9 flex-1 rounded-md border border-border bg-background px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Sélectionner un template...</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>
      {selectedTemplate && selectedTemplate.description && (
        <p className="text-xs text-muted-foreground">
          {selectedTemplate.description}
        </p>
      )}
    </div>
  );
}

