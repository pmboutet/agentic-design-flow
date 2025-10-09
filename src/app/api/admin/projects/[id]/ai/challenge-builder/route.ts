import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { fetchProjectJourneyContext } from "@/lib/projectJourneyLoader";
import { executeAgent } from "@/lib/ai/service";
import { createChallengeFoundationInsights } from "@/lib/foundationInsights";
import {
  type AiChallengeBuilderResponse,
  type AiChallengeUpdateSuggestion,
  type AiNewChallengeSuggestion,
  type ApiResponse,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
  type ProjectParticipantSummary,
} from "@/types";

const DEFAULT_CHALLENGE_AGENT_SLUG = process.env.CHALLENGE_BUILDER_AGENT_SLUG ?? "challenge-builder";
const DEFAULT_CREATION_AGENT_SLUG = process.env.NEW_CHALLENGE_BUILDER_AGENT_SLUG ?? "challenge-builder";

const CHALLENGE_INTERACTION_TYPE = "project_challenge_revision";
const CREATION_INTERACTION_TYPE = "project_new_challenge_generation";

const CHALLENGE_STATUS_VALUES = new Set(["open", "in_progress", "active", "closed", "archived"]);
const CHALLENGE_IMPACT_VALUES = new Set<ProjectChallengeNode["impact"]>(["low", "medium", "high", "critical"]);

const requestSchema = z
  .object({
    agentSlug: z.string().trim().min(1).optional(),
    creationAgentSlug: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  })
  .optional();

const ownerSuggestionSchema = z.object({
  id: z.string().trim().min(1).optional().nullable(),
  name: z.string().trim().min(1),
  role: z.string().trim().optional().nullable(),
});

const challengeUpdateBlockSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    status: z.string().trim().min(1).optional(),
    impact: z.string().trim().min(1).optional(),
    owners: z.array(ownerSuggestionSchema).optional(),
  })
  .partial();

const subChallengeUpdateSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  status: z.string().trim().min(1).optional(),
  impact: z.string().trim().min(1).optional(),
  summary: z.string().trim().optional(),
});

const subChallengeCreateSchema = z.object({
  referenceId: z.string().trim().min(1).optional(),
  parentId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(1),
  description: z.string().trim().optional(),
  status: z.string().trim().min(1).optional(),
  impact: z.string().trim().min(1).optional(),
  owners: z.array(ownerSuggestionSchema).optional(),
  summary: z.string().trim().optional(),
  foundationInsights: z.array(foundationInsightSchema).optional(),
});

const foundationInsightSchema = z.object({
  insightId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

const challengeSuggestionSchema = z.object({
  challengeId: z.string().trim().min(1).optional(),
  summary: z.string().trim().optional(),
  foundationInsights: z.array(foundationInsightSchema).optional(),
  updates: challengeUpdateBlockSchema.optional(),
  subChallenges: z
    .object({
      update: z.array(subChallengeUpdateSchema).optional(),
      updates: z.array(subChallengeUpdateSchema).optional(),
      create: z.array(subChallengeCreateSchema).optional(),
      new: z.array(subChallengeCreateSchema).optional(),
    })
    .partial()
    .optional(),
  newSubChallenges: z.array(subChallengeCreateSchema).optional(),
  errors: z.array(z.string().trim()).optional(),
});

const newChallengePayloadSchema = z.object({
  summary: z.string().trim().optional(),
  newChallenges: z.array(subChallengeCreateSchema).optional(),
  challenges: z.array(subChallengeCreateSchema).optional(),
});

interface InsightSummary {
  id: string;
  title: string;
  type: string;
  description: string;
  status: string;
  isCompleted: boolean;
  askId: string | null;
  askTitle: string | null;
}

interface ChallengeContextPayload {
  project: {
    id: string;
    name: string;
    goal: string | null | undefined;
    status: string | null | undefined;
    timeframe: string | null | undefined;
  };
  challenge: {
    id: string;
    title: string;
    description: string;
    status: string;
    impact: ProjectChallengeNode["impact"];
    parentId: string | null;
    owners: ProjectParticipantSummary[];
  };
  subChallenges: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    impact: ProjectChallengeNode["impact"];
    owners: ProjectParticipantSummary[];
  }>;
  insights: InsightSummary[];
  relatedAsks: Array<{
    id: string;
    title: string;
    summary: string;
    status: string;
    dueDate: string | null;
  }>;
}

function flattenChallengeTree(nodes: ProjectChallengeNode[]): ProjectChallengeNode[] {
  return nodes.flatMap(node => [node, ...(node.children ? flattenChallengeTree(node.children) : [])]);
}

function buildChallengeParentMap(nodes: ProjectChallengeNode[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  const stack: Array<{ node: ProjectChallengeNode; parentId: string | null }> = nodes.map(node => ({ node, parentId: null }));

  while (stack.length > 0) {
    const { node, parentId } = stack.pop()!;
    map.set(node.id, parentId);
    if (node.children?.length) {
      node.children.forEach(child => {
        stack.push({ node: child, parentId: node.id });
      });
    }
  }

  return map;
}

function normaliseImpact(value?: string | null): ProjectChallengeNode["impact"] | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (CHALLENGE_IMPACT_VALUES.has(normalized as ProjectChallengeNode["impact"])) {
    return normalized as ProjectChallengeNode["impact"];
  }
  return null;
}

function normaliseStatus(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  return CHALLENGE_STATUS_VALUES.has(normalized) ? normalized : null;
}

function sanitizeJsonString(jsonString: string): string {
  // Remove any potential BOM or invisible characters
  let cleaned = jsonString.replace(/^\uFEFF/, '').trim();
  
  // Fix common JSON issues
  cleaned = cleaned
    // Fix property names that are not properly quoted
    .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
    // Fix property names with special characters or spaces
    .replace(/([{,]\s*)([^"{\[\s][^:]*?)\s*:/g, '$1"$2":')
    // Fix unescaped quotes in string values
    .replace(/([^\\])"([^"]*)"([^,}\]]*)"([^,}\]]*)"([^,}\]]*)/g, '$1"$2\\"$3\\"$4\\"$5')
    // Remove trailing commas before closing brackets/braces
    .replace(/,(\s*[}\]])/g, '$1')
    // Fix missing commas between array elements
    .replace(/}(\s*){/g, '},$1{')
    .replace(/](\s*)\[/g, '],$1[')
    .replace(/"(\s*){/g, '",$1{')
    .replace(/"(\s*)\[/g, '",$1[')
    // Fix single quotes to double quotes
    .replace(/'/g, '"')
    // Fix common French character issues in JSON
    .replace(/é/g, '\\u00e9')
    .replace(/è/g, '\\u00e8')
    .replace(/à/g, '\\u00e0')
    .replace(/ç/g, '\\u00e7')
    .replace(/ù/g, '\\u00f9')
    .replace(/â/g, '\\u00e2')
    .replace(/ê/g, '\\u00ea')
    .replace(/î/g, '\\u00ee')
    .replace(/ô/g, '\\u00f4')
    .replace(/û/g, '\\u00fb');
  
  return cleaned;
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Empty response from agent");
  }

  if (trimmed.startsWith("```")) {
    const lines = trimmed.split(/\r?\n/);
    const startIndex = lines.findIndex(line => line.trim().startsWith("{"));
    const endIndex = lines.reduceRight((acc, line, index) => {
      if (acc !== -1) {
        return acc;
      }
      return line.trim().endsWith("}") ? index : -1;
    }, -1);

    if (startIndex >= 0 && endIndex >= startIndex) {
      return lines.slice(startIndex, endIndex + 1).join("\n");
    }
  }

  // Find JSON boundaries more carefully - look for complete JSON object
  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    return trimmed;
  }

  // Count braces to find the complete JSON object
  let braceCount = 0;
  let lastBrace = -1;
  
  for (let i = firstBrace; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      braceCount++;
    } else if (trimmed[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        lastBrace = i;
        break;
      }
    }
  }

  if (lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    
    // Basic validation: check if it looks like valid JSON
    if (candidate.includes('"') && candidate.includes('{')) {
      return candidate;
    }
  }

  // Fallback: try to find any JSON-like structure
  const fallbackMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fallbackMatch) {
    return fallbackMatch[0];
  }

  return trimmed;
}

function parseChallengeSuggestion(
  content: string,
  challenge: ProjectChallengeNode,
): z.infer<typeof challengeSuggestionSchema> {
  const candidate = extractJsonCandidate(content);
  const parsed = JSON.parse(candidate);

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const result = challengeSuggestionSchema.safeParse(item);
      if (result.success) {
        return result.data;
      }
    }
    throw new Error("Agent response array did not contain a valid challenge suggestion");
  }

  if (parsed && typeof parsed === "object" && "challenge" in parsed) {
    const nested = (parsed as Record<string, unknown>).challenge;
    const result = challengeSuggestionSchema.safeParse({
      ...(typeof parsed === "object" ? parsed : {}),
      ...(nested && typeof nested === "object" ? nested : {}),
    });
    if (result.success) {
      return result.data;
    }
  }

  const result = challengeSuggestionSchema.parse(parsed);
  if (result.challengeId && result.challengeId !== challenge.id) {
    throw new Error(
      `Challenge id mismatch in agent response (expected ${challenge.id}, received ${result.challengeId})`,
    );
  }
  return result;
}

function parseNewChallengeSuggestions(content: string) {
  const candidate = extractJsonCandidate(content);
  
  // Try multiple sanitization strategies
  const sanitizationAttempts = [
    sanitizeJsonString(candidate),
    candidate.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''), // Remove control characters
    candidate.replace(/\n/g, ' ').replace(/\s+/g, ' '), // Normalize whitespace
    candidate.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ''), // Keep only printable chars and unicode
  ];
  
  // Add robust JSON parsing with error handling
  let parsed;
  let lastError: Error | null = null;
  
  for (let i = 0; i < sanitizationAttempts.length; i++) {
    try {
      parsed = JSON.parse(sanitizationAttempts[i]);
      break; // Success!
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown parsing error');
      if (i === sanitizationAttempts.length - 1) {
        // Last attempt failed
        console.error('JSON parsing error after all attempts:', lastError);
        console.error('Raw content:', content);
        console.error('Extracted candidate:', candidate);
        console.error('Sanitization attempts:', sanitizationAttempts);
        throw new Error(`Invalid JSON response from agent: ${lastError.message}`);
      }
    }
  }

  // Handle the new response format with summary and newChallenges
  if (parsed && typeof parsed === "object" && "newChallenges" in parsed) {
    const newChallenges = parsed.newChallenges;
    if (Array.isArray(newChallenges)) {
      return newChallenges.map(challenge => newChallengePayloadSchema.parse({
        newChallenges: [challenge]
      }));
    }
    return [];
  }

  // Handle legacy array format
  if (Array.isArray(parsed)) {
    return parsed.map(item => newChallengePayloadSchema.parse(item));
  }

  return [newChallengePayloadSchema.parse(parsed)];
}

function normaliseOwnerSuggestions(suggestions: Array<z.infer<typeof ownerSuggestionSchema>> | undefined) {
  if (!suggestions || suggestions.length === 0) {
    return undefined;
  }
  return suggestions.map(owner => ({
    id: owner.id ?? owner.name,
    name: owner.name,
    role: owner.role ?? undefined,
  }));
}

function buildChallengeContext(
  boardData: ProjectJourneyBoardData,
  challenge: ProjectChallengeNode,
  parentMap: Map<string, string | null>,
  insightLookup: Map<string, InsightSummary>,
  asksById: Map<string, { id: string; title: string; summary: string; status: string; dueDate: string | null }>,
): ChallengeContextPayload {
  const insights: InsightSummary[] = [];
  const askIds = new Set<string>();

  challenge.relatedInsightIds.forEach(insightId => {
    const insight = insightLookup.get(insightId);
    if (insight) {
      insights.push(insight);
      if (insight.askId) {
        askIds.add(insight.askId);
      }
    }
  });

  const relatedAsks = Array.from(askIds)
    .map(askId => asksById.get(askId))
    .filter((ask): ask is { id: string; title: string; summary: string; status: string; dueDate: string | null } => Boolean(ask));

  return {
    project: {
      id: boardData.projectId,
      name: boardData.projectName,
      goal: boardData.projectGoal,
      status: boardData.projectStatus,
      timeframe: boardData.timeframe,
    },
    challenge: {
      id: challenge.id,
      title: challenge.title,
      description: challenge.description,
      status: challenge.status,
      impact: challenge.impact,
      parentId: parentMap.get(challenge.id) ?? null,
      owners: challenge.owners ?? [],
    },
    subChallenges: (challenge.children ?? []).map(child => ({
      id: child.id,
      title: child.title,
      description: child.description,
      status: child.status,
      impact: child.impact,
      owners: child.owners ?? [],
    })),
    insights,
    relatedAsks,
  } satisfies ChallengeContextPayload;
}

function aggregateInsightLookup(
  boardData: ProjectJourneyBoardData,
  askRows: any[],
  insightRows: any[],
): Map<string, InsightSummary> {
  const lookup = new Map<string, InsightSummary>();
  const askTitleById = new Map<string, { title: string; summary: string; status: string; dueDate: string | null }>();
  const insightRowById = new Map<string, any>();

  for (const row of askRows) {
    const title = row.name || row.ask_key || `ASK ${String(row.id).slice(0, 8)}`;
    const summary = row.description ?? row.question ?? "";
    const status = row.status ?? "active";
    const dueDate = row.end_date ?? row.start_date ?? null;
    askTitleById.set(row.id, { title, summary, status, dueDate });
  }

  insightRows.forEach(row => {
    if (row?.id) {
      insightRowById.set(row.id, row);
    }
  });

  const seen = new Set<string>();

  boardData.asks.forEach(ask => {
    ask.participants.forEach(participant => {
      participant.insights.forEach(insight => {
        if (seen.has(insight.id)) {
          return;
        }
        seen.add(insight.id);

        const raw = insightRowById.get(insight.id);
        const status = (raw?.status as string) ?? "new";
        lookup.set(insight.id, {
          id: insight.id,
          title: insight.title,
          type: insight.type,
          description: insight.description,
          status,
          isCompleted: insight.isCompleted,
          askId: ask.id,
          askTitle: ask.title,
        });
      });
    });
  });

  insightRows.forEach(row => {
    if (lookup.has(row.id)) {
      return;
    }

    const askInfo = askTitleById.get(row.ask_session_id);
    const title =
      typeof row.summary === "string" && row.summary.trim().length > 0
        ? row.summary.trim()
        : typeof row.content === "string"
          ? row.content.slice(0, 80)
          : `Insight ${String(row.id).slice(0, 8)}`;

    lookup.set(row.id, {
      id: row.id,
      title,
      type: row.insight_types?.name ?? row.insight_type_id ?? "signal",
      description: row.content ?? row.summary ?? "",
      status: row.status ?? "new",
      isCompleted: false,
      askId: row.ask_session_id ?? null,
      askTitle: askInfo?.title ?? null,
    });
  });

  return lookup;
}

function buildAsksMap(askRows: any[]) {
  return new Map<string, { id: string; title: string; summary: string; status: string; dueDate: string | null }>(
    askRows.map(row => {
      const title = row.name || row.ask_key || `ASK ${String(row.id).slice(0, 8)}`;
      const summary = row.description ?? row.question ?? "";
      const status = row.status ?? "active";
      const dueDate = row.end_date ?? row.start_date ?? null;
      return [row.id, { id: row.id, title, summary, status, dueDate }];
    }),
  );
}

function mapChallengeSuggestion(
  suggestion: z.infer<typeof challengeSuggestionSchema>,
  challenge: ProjectChallengeNode,
  agentMetadata: { logId: string; agentId?: string | null; modelConfigId?: string | null },
): AiChallengeUpdateSuggestion {
  const updates = suggestion.updates ?? null;
  const subUpdateBlock = suggestion.subChallenges ?? {};
  const newSubBlock = suggestion.newSubChallenges ?? [];
  const foundationInsights = suggestion.foundationInsights ?? [];

  const normalisedUpdates = updates
    ? {
        title: updates.title ?? null,
        description: updates.description ?? null,
        status: normaliseStatus(updates.status),
        impact: normaliseImpact(updates.impact),
        owners: normaliseOwnerSuggestions(updates.owners) ?? undefined,
      }
    : null;

  const subUpdates = [
    ...(subUpdateBlock.update ?? []),
    ...(subUpdateBlock.updates ?? []),
  ];

  const newSubs = [
    ...(subUpdateBlock.create ?? []),
    ...(subUpdateBlock.new ?? []),
    ...newSubBlock,
  ];

  return {
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    summary: suggestion.summary ?? null,
    foundationInsights: foundationInsights.length
      ? foundationInsights.map(insight => ({
          insightId: insight.insightId,
          title: insight.title,
          reason: insight.reason,
          priority: insight.priority,
        }))
      : undefined,
    updates: normalisedUpdates,
    subChallengeUpdates: subUpdates.length
      ? subUpdates.map(item => ({
          id: item.id,
          title: item.title ?? null,
          description: item.description ?? null,
          status: normaliseStatus(item.status),
          impact: normaliseImpact(item.impact),
          summary: item.summary ?? null,
        }))
      : undefined,
    newSubChallenges: newSubs.length
      ? newSubs.map(item => ({
          referenceId: item.referenceId ?? null,
          parentId: item.parentId ?? challenge.id,
          title: item.title,
          description: item.description ?? null,
          status: normaliseStatus(item.status),
          impact: normaliseImpact(item.impact),
          owners: normaliseOwnerSuggestions(item.owners),
          summary: item.summary ?? null,
        }))
      : undefined,
    agentMetadata,
    rawResponse: undefined,
    errors: suggestion.errors,
  } satisfies AiChallengeUpdateSuggestion;
}

function mapNewChallengeSuggestion(item: z.infer<typeof subChallengeCreateSchema>, defaultParent: string | null): AiNewChallengeSuggestion {
  return {
    referenceId: item.referenceId ?? null,
    parentId: item.parentId ?? defaultParent,
    title: item.title,
    description: item.description ?? null,
    status: normaliseStatus(item.status),
    impact: normaliseImpact(item.impact),
    owners: normaliseOwnerSuggestions(item.owners),
    summary: item.summary ?? null,
    foundationInsights: item.foundationInsights?.map(insight => ({
      insightId: insight.insightId,
      title: insight.title,
      reason: insight.reason,
      priority: insight.priority,
    })) ?? undefined,
  } satisfies AiNewChallengeSuggestion;
}

function buildNewChallengeSuggestions(
  payloads: Array<z.infer<typeof newChallengePayloadSchema>>,
  defaultParent: string | null,
): AiNewChallengeSuggestion[] {
  const list: AiNewChallengeSuggestion[] = [];

  payloads.forEach(payload => {
    const candidates = payload.newChallenges ?? payload.challenges ?? [];
    candidates.forEach(candidate => {
      list.push(mapNewChallengeSuggestion(candidate, defaultParent));
    });
  });

  return list;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const projectId = z.string().uuid().parse(params.id);
    const options = requestSchema?.parse(await request.json().catch(() => ({}))) ?? {};

    const supabase = getAdminSupabaseClient();
    const context = await fetchProjectJourneyContext(supabase, projectId);
    const { boardData } = context;

    const parentMap = buildChallengeParentMap(boardData.challenges);
    const challengeList = flattenChallengeTree(boardData.challenges);
    const insightLookup = aggregateInsightLookup(boardData, context.askRows, context.insightRows);
    const asksById = buildAsksMap(context.askRows);

    const challengeSuggestions: AiChallengeUpdateSuggestion[] = [];
    const errors: Array<{ challengeId: string | null; message: string }> = [];

    for (const challenge of challengeList) {
      const challengeContext = buildChallengeContext(boardData, challenge, parentMap, insightLookup, asksById);
      const contextJson = JSON.stringify(challengeContext);

      try {
        const result = await executeAgent({
          supabase,
          agentSlug: options.agentSlug ?? DEFAULT_CHALLENGE_AGENT_SLUG,
          interactionType: CHALLENGE_INTERACTION_TYPE,
          variables: {
            project_name: boardData.projectName,
            project_goal: boardData.projectGoal ?? "",
            project_status: boardData.projectStatus ?? "",
            challenge_id: challenge.id,
            challenge_title: challenge.title,
            challenge_status: challenge.status,
            challenge_impact: challenge.impact,
            challenge_context_json: contextJson,
          },
          maxOutputTokens: options.maxOutputTokens,
          temperature: options.temperature,
        });

        const parsedSuggestion = parseChallengeSuggestion(result.content, challenge);
        const mapped = mapChallengeSuggestion(parsedSuggestion, challenge, {
          logId: result.logId,
          agentId: result.agent.id,
          modelConfigId: result.modelConfig.id,
        });
        mapped.rawResponse = result.content;
        challengeSuggestions.push(mapped);
      } catch (error) {
        errors.push({
          challengeId: challenge.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const newChallengeSuggestions: AiNewChallengeSuggestion[] = [];

    try {
      const projectContext = {
        project: {
          id: boardData.projectId,
          name: boardData.projectName,
          goal: boardData.projectGoal,
          status: boardData.projectStatus,
          timeframe: boardData.timeframe,
        },
        challenges: challengeList.map(challenge => ({
          id: challenge.id,
          title: challenge.title,
          description: challenge.description,
          status: challenge.status,
          impact: challenge.impact,
          parentId: parentMap.get(challenge.id) ?? null,
        })),
        insights: Array.from(insightLookup.values()),
        asks: Array.from(asksById.values()),
      } satisfies Record<string, unknown>;

      const result = await executeAgent({
        supabase,
        agentSlug: options.creationAgentSlug ?? DEFAULT_CREATION_AGENT_SLUG,
        interactionType: CREATION_INTERACTION_TYPE,
        variables: {
          project_name: boardData.projectName,
          project_goal: boardData.projectGoal ?? "",
          project_status: boardData.projectStatus ?? "",
          project_context_json: JSON.stringify(projectContext),
        },
        maxOutputTokens: options.maxOutputTokens,
        temperature: options.temperature,
      });

      const parsedPayloads = parseNewChallengeSuggestions(result.content);
      const mapped = buildNewChallengeSuggestions(parsedPayloads, null);
      newChallengeSuggestions.push(...mapped);
    } catch (error) {
      errors.push({
        challengeId: null,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    // Filter out empty suggestions that don't have any meaningful updates
    const filteredChallengeSuggestions = challengeSuggestions.filter(suggestion => {
      // Check if the suggestion has any meaningful updates
      const hasUpdates = suggestion.updates && (
        suggestion.updates.title ||
        suggestion.updates.description ||
        suggestion.updates.status ||
        suggestion.updates.impact ||
        suggestion.updates.owners?.length
      );
      
      const hasSubUpdates = suggestion.subChallengeUpdates?.length;
      const hasNewSubs = suggestion.newSubChallenges?.length;
      
      // Only include suggestions that have actual changes to propose
      return hasUpdates || hasSubUpdates || hasNewSubs;
    });

    const payload: AiChallengeBuilderResponse = {
      challengeSuggestions: filteredChallengeSuggestions,
      newChallengeSuggestions,
      errors: errors.length ? errors : undefined,
    };

    return NextResponse.json<ApiResponse<AiChallengeBuilderResponse>>({
      success: true,
      data: payload,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: error.errors[0]?.message || "Invalid request",
      }, { status: 400 });
    }

    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}
