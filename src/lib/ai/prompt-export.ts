import type { AiAgentRecord } from "@/types";

type ExportOptions = {
  generatedAt?: Date;
};

const CODE_FENCE = "~~~text";

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function wrapInFence(content: string): string {
  const safeContent = normalizeLineEndings(content);
  const body = safeContent.length > 0 ? safeContent : "(vide)";
  return `${CODE_FENCE}\n${body}\n~~~`;
}

function formatModel(config?: AiAgentRecord["modelConfig"], fallbackId?: string | null): string {
  if (config) {
    const parts = [config.name];
    if (config.model) {
      parts.push(`(${config.model})`);
    }
    return parts.join(" ");
  }

  if (fallbackId) {
    return `ID: ${fallbackId}`;
  }

  return "Non configuré";
}

function formatDate(date?: string | null): string | null {
  if (!date) {
    return null;
  }
  try {
    const parsed = new Date(date);
    return parsed.toLocaleString("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return date;
  }
}

function buildAgentSection(agent: AiAgentRecord): string {
  const description = agent.description?.trim();
  const variables = agent.availableVariables ?? [];
  const sortedVariables = [...variables].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));

  const metadataLines = [
    `- **Slug** : \`${agent.slug}\``,
    `- **ID** : \`${agent.id}\``,
    `- **Agent vocal** : ${agent.voice ? "Oui" : "Non"}`,
    `- **Modèle principal** : ${formatModel(agent.modelConfig, agent.modelConfigId)}`,
    `- **Modèle de secours** : ${formatModel(agent.fallbackModelConfig, agent.fallbackModelConfigId)}`,
    sortedVariables.length > 0
      ? `- **Variables** : ${sortedVariables.map(variable => `\`${variable}\``).join(", ")}`
      : "- **Variables** : _Aucune variable déclarée_",
  ];

  const createdAt = formatDate(agent.createdAt);
  const updatedAt = formatDate(agent.updatedAt);

  if (createdAt) {
    metadataLines.push(`- **Créé le** : ${createdAt}`);
  }

  if (updatedAt) {
    metadataLines.push(`- **Mis à jour le** : ${updatedAt}`);
  }

  return [
    `## ${agent.name}`,
    description ? `_${description}_` : "_Pas de description fournie._",
    "",
    ...metadataLines,
    "",
    "### System prompt",
    wrapInFence(agent.systemPrompt),
    "",
    "### User prompt",
    wrapInFence(agent.userPrompt),
  ].join("\n");
}

export function generateAiPromptsMarkdown(agents: AiAgentRecord[], options: ExportOptions = {}): string {
  const generatedAt = options.generatedAt ?? new Date();
  const headerDate = generatedAt.toLocaleString("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const sortedAgents = [...agents].sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));

  const sections = sortedAgents.length > 0
    ? sortedAgents.map(buildAgentSection)
    : ["_Aucun agent n'a été trouvé dans la base de données._"];

  return [
    "# Export des prompts IA",
    "",
    `_Généré le ${headerDate}_`,
    "",
    sections.join("\n\n---\n\n"),
    "",
  ].join("\n");
}




