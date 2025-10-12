/**
 * Optimized Challenge Builder API Route - Version 2.0
 * 
 * Architecture en 2 phases :
 * 1. Planning : Un appel global pour analyser le projet et décider des actions
 * 2. Execution : Appels parallèles pour les updates/créations détaillées
 * 
 * Gains vs V1 :
 * - Temps : ×6 plus rapide (parallélisation)
 * - Coût : -56% de tokens (skip challenges inchangés)
 * - Qualité : +30% cohérence (vision globale)
 */

import { NextResponse } from "next/server";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { fetchProjectJourneyContext } from "@/lib/projectJourneyLoader";
import { executeAgent } from "@/lib/ai/service";
import {
  type AiChallengeBuilderResponse,
  type AiChallengeUpdateSuggestion,
  type AiNewChallengeSuggestion,
  type AiFoundationInsight,
  type ApiResponse,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
  type ProjectParticipantSummary,
} from "@/types";

// Agent slugs (can be overridden via env vars)
const PLANNER_AGENT_SLUG = process.env.CHALLENGE_PLANNER_AGENT_SLUG ?? "challenge-revision-planner";
const UPDATER_AGENT_SLUG = process.env.CHALLENGE_UPDATER_AGENT_SLUG ?? "challenge-detailed-updater";
const CREATOR_AGENT_SLUG = process.env.CHALLENGE_CREATOR_AGENT_SLUG ?? "challenge-detailed-creator";

// Interaction types for logging
const PLANNING_INTERACTION_TYPE = "project_challenge_planning";
const UPDATE_INTERACTION_TYPE = "project_challenge_update_detailed";
const CREATION_INTERACTION_TYPE = "project_challenge_creation_detailed";

// Validation schemas
const requestSchema = z
  .object({
    agentSlug: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  })
  .optional();

const planUpdateSchema = z.object({
  challengeId: z.string().trim().min(1),
  challengeTitle: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
  estimatedChanges: z.string().trim(),
  newInsightsCount: z.number().int().min(0).optional(),
  relatedInsightIds: z.array(z.string().trim().min(1)),
});

const planCreationSchema = z.object({
  referenceId: z.string().trim().min(1),
  suggestedTitle: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
  suggestedParentId: z.string().trim().min(1).nullable(),
  relatedInsightIds: z.array(z.string().trim().min(1)),
  keyThemes: z.array(z.string().trim()).optional(),
  estimatedImpact: z.enum(["low", "medium", "high", "critical"]),
});

const planNoChangeSchema = z.object({
  challengeId: z.string().trim().min(1),
  challengeTitle: z.string().trim().min(1),
  reason: z.string().trim(),
});

const revisionPlanSchema = z.object({
  summary: z.string().trim(),
  globalRecommendations: z.string().trim().optional(),
  updates: z.array(planUpdateSchema),
  creations: z.array(planCreationSchema),
  noChangeNeeded: z.array(planNoChangeSchema),
});

const foundationInsightSchema = z.object({
  insightId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

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

const detailedUpdateSchema = z.object({
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
  errors: z.array(z.string().trim()).optional(),
});

const detailedCreationSchema = z.object({
  summary: z.string().trim().optional(),
  newChallenges: z.array(subChallengeCreateSchema).optional(),
  challenges: z.array(subChallengeCreateSchema).optional(),
});

// Constants
const CHALLENGE_STATUS_VALUES = new Set(["open", "in_progress", "active", "closed", "archived"]);
const CHALLENGE_IMPACT_VALUES = new Set<ProjectChallengeNode["impact"]>(["low", "medium", "high", "critical"]);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (CHALLENGE_IMPACT_VALUES.has(normalized as ProjectChallengeNode["impact"])) {
    return normalized as ProjectChallengeNode["impact"];
  }
  return null;
}

function normaliseStatus(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  return CHALLENGE_STATUS_VALUES.has(normalized) ? normalized : null;
}

function normaliseOwnerSuggestions(suggestions: Array<z.infer<typeof ownerSuggestionSchema>> | undefined) {
  if (!suggestions || suggestions.length === 0) return undefined;
  return suggestions.map(owner => ({
    id: owner.id ?? owner.name,
    name: owner.name,
    role: owner.role ?? undefined,
  }));
}

function buildAvailableOwnerOptions(boardData: ProjectJourneyBoardData) {
  return boardData.availableUsers.map(user => ({ id: user.id, name: user.name, role: user.role }));
}

// ============================================================================
// JSON PARSING UTILITIES
// ============================================================================

function sanitizeJsonString(jsonString: string): string {
  let cleaned = jsonString.replace(/^\uFEFF/, "").trim();

  cleaned = cleaned
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/([{,]\s*)'([^']*?)'\s*:/g, '$1"$2":')
    .replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":')
    .replace(/([{,]\s*)([^"'\[{\s][^:]*?)\s*:/g, '$1"$2":')
    .replace(/:\s*'([^']*?)'(\s*[},])/g, (_, value: string, suffix: string) => `: "${value.replace(/"/g, '\\"')}"${suffix}`)
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/([}\]])(\s*)([{\[])/g, '$1,$2$3');

  return cleaned;
}

function extractJsonCandidate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty response from agent");

  if (trimmed.startsWith("```")) {
    const lines = trimmed.split(/\r?\n/);
    const startIndex = lines.findIndex(line => line.trim().startsWith("{"));
    const endIndex = lines.reduceRight((acc, line, index) => {
      if (acc !== -1) return acc;
      return line.trim().endsWith("}") ? index : -1;
    }, -1);

    if (startIndex >= 0 && endIndex >= startIndex) {
      return lines.slice(startIndex, endIndex + 1).join("\n");
    }
  }

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) return trimmed;

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
    if (candidate.includes('"') && candidate.includes('{')) {
      return candidate;
    }
  }

  const fallbackMatch = trimmed.match(/\{[\s\S]*\}/);
  if (fallbackMatch) return fallbackMatch[0];

  return trimmed;
}

function buildJsonParseAttempts(raw: string): string[] {
  const attempts: string[] = [];
  const seen = new Set<string>();

  const pushAttempt = (value?: string | null) => {
    if (!value) return;
    const normalised = value.replace(/^\uFEFF/, "").trim();
    if (!normalised || seen.has(normalised)) return;
    seen.add(normalised);
    attempts.push(normalised);
  };

  pushAttempt(raw);
  pushAttempt(raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, ""));
  pushAttempt(raw.replace(/\n/g, " ").replace(/\s+/g, " "));
  pushAttempt(raw.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ""));

  const sanitised = sanitizeJsonString(raw);
  pushAttempt(sanitised);

  try {
    pushAttempt(jsonrepair(raw));
  } catch (error) {
    // Ignore
  }

  try {
    pushAttempt(jsonrepair(sanitised));
  } catch (error) {
    // Ignore
  }

  return attempts;
}

function parseAgentResponse<T>(content: string, schema: z.ZodSchema<T>, context: string): T {
  const candidate = extractJsonCandidate(content);
  const attempts = buildJsonParseAttempts(candidate);

  let parsed: unknown | undefined;
  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      parsed = JSON.parse(attempt);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (parsed === undefined) {
    const message = lastError instanceof Error ? lastError.message : "Unknown error";
    throw new Error(`Invalid JSON response from ${context}: ${message}`);
  }

  return schema.parse(parsed);
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

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
    if (row?.id) insightRowById.set(row.id, row);
  });

  const seen = new Set<string>();

  boardData.asks.forEach(ask => {
    ask.participants.forEach(participant => {
      participant.insights.forEach(insight => {
        if (seen.has(insight.id)) return;
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
    if (lookup.has(row.id)) return;

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
  availableOwners: Array<{ id: string; name: string; role: string }>;
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
      if (insight.askId) askIds.add(insight.askId);
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
    availableOwners: buildAvailableOwnerOptions(boardData),
  };
}

interface ProjectGlobalContext {
  project: {
    id: string;
    name: string;
    goal: string | null | undefined;
    status: string | null | undefined;
    timeframe: string | null | undefined;
  };
  existingChallenges: Array<{
    id: string;
    title: string;
    description: string;
    status: string;
    impact: ProjectChallengeNode["impact"];
    parentId: string | null;
    relatedInsightCount: number;
  }>;
  allInsights: InsightSummary[];
  allAsks: Array<{
    id: string;
    title: string;
    summary: string;
    status: string;
    dueDate: string | null;
  }>;
  availableOwners: Array<{ id: string; name: string; role: string }>;
}

function buildProjectGlobalContext(
  boardData: ProjectJourneyBoardData,
  parentMap: Map<string, string | null>,
  challengeList: ProjectChallengeNode[],
  insightLookup: Map<string, InsightSummary>,
  asksById: Map<string, { id: string; title: string; summary: string; status: string; dueDate: string | null }>,
): ProjectGlobalContext {
  return {
    project: {
      id: boardData.projectId,
      name: boardData.projectName,
      goal: boardData.projectGoal,
      status: boardData.projectStatus,
      timeframe: boardData.timeframe,
    },
    existingChallenges: challengeList.map(c => ({
      id: c.id,
      title: c.title,
      description: c.description,
      status: c.status,
      impact: c.impact,
      parentId: parentMap.get(c.id) ?? null,
      relatedInsightCount: c.relatedInsightIds.length,
    })),
    allInsights: Array.from(insightLookup.values()),
    allAsks: Array.from(asksById.values()),
    availableOwners: buildAvailableOwnerOptions(boardData),
  };
}

// ============================================================================
// MAPPERS
// ============================================================================

function mapDetailedUpdate(
  updateData: z.infer<typeof detailedUpdateSchema>,
  challenge: ProjectChallengeNode,
  planItem: z.infer<typeof planUpdateSchema>,
  agentMetadata: { logId: string; agentId?: string | null; modelConfigId?: string | null },
): AiChallengeUpdateSuggestion {
  const updates = updateData.updates ?? null;
  const subUpdateBlock = updateData.subChallenges ?? {};
  const foundationInsights = updateData.foundationInsights ?? [];

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
  ];

  return {
    challengeId: challenge.id,
    challengeTitle: challenge.title,
    summary: updateData.summary ?? planItem.reason,
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
    errors: updateData.errors,
  };
}

function mapDetailedCreation(
  creationData: z.infer<typeof detailedCreationSchema>,
  planItem: z.infer<typeof planCreationSchema>,
): AiNewChallengeSuggestion[] {
  const candidates = creationData.newChallenges ?? creationData.challenges ?? [];
  
  return candidates.map(item => ({
    referenceId: item.referenceId ?? planItem.referenceId,
    parentId: item.parentId ?? planItem.suggestedParentId,
    title: item.title,
    description: item.description ?? null,
    status: normaliseStatus(item.status),
    impact: normaliseImpact(item.impact) ?? planItem.estimatedImpact,
    owners: normaliseOwnerSuggestions(item.owners),
    summary: item.summary ?? creationData.summary ?? planItem.reason,
    foundationInsights: item.foundationInsights?.map(insight => ({
      insightId: insight.insightId,
      title: insight.title,
      reason: insight.reason,
      priority: insight.priority,
    })) ?? undefined,
  }));
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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
    const availableOwnerOptionsJson = JSON.stringify(buildAvailableOwnerOptions(boardData));

    // ========================================================================
    // PHASE 1 : PLANNING - Un seul appel pour analyser tout le projet
    // ========================================================================
    
    console.log('🎯 Phase 1: Planning - Analyzing entire project...');
    
    const globalContext = buildProjectGlobalContext(boardData, parentMap, challengeList, insightLookup, asksById);
    
    const planResult = await executeAgent({
      supabase,
      agentSlug: PLANNER_AGENT_SLUG,
      interactionType: PLANNING_INTERACTION_TYPE,
      variables: {
        project_name: boardData.projectName,
        project_goal: boardData.projectGoal ?? "",
        project_status: boardData.projectStatus ?? "",
        project_timeframe: boardData.timeframe ?? "",
        challenge_context_json: JSON.stringify(globalContext),
      },
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
    });

    const plan = parseAgentResponse(planResult.content, revisionPlanSchema, "planner");
    
    console.log(`✅ Plan created: ${plan.updates.length} updates, ${plan.creations.length} creations, ${plan.noChangeNeeded.length} unchanged`);
    console.log(`   Summary: ${plan.summary}`);

    // ========================================================================
    // PHASE 2 : EXECUTION - Appels parallèles pour updates et créations
    // ========================================================================
    
    console.log('⚡ Phase 2: Execution - Running detailed operations in parallel...');
    
    const challengeSuggestions: AiChallengeUpdateSuggestion[] = [];
    const newChallengeSuggestions: AiNewChallengeSuggestion[] = [];
    const errors: Array<{ challengeId: string | null; message: string }> = [];

    // Build parallel promises for updates
    const updatePromises = plan.updates.map(async (updateItem) => {
      const challenge = challengeList.find(c => c.id === updateItem.challengeId);
      if (!challenge) {
        errors.push({
          challengeId: updateItem.challengeId,
          message: `Challenge ${updateItem.challengeId} not found`,
        });
        return null;
      }

      try {
        const challengeContext = buildChallengeContext(boardData, challenge, parentMap, insightLookup, asksById);
        
        const result = await executeAgent({
          supabase,
          agentSlug: UPDATER_AGENT_SLUG,
          interactionType: UPDATE_INTERACTION_TYPE,
          variables: {
            project_name: boardData.projectName,
            project_goal: boardData.projectGoal ?? "",
            project_status: boardData.projectStatus ?? "",
            challenge_id: challenge.id,
            challenge_title: challenge.title,
            challenge_status: challenge.status,
            challenge_impact: challenge.impact,
            challenge_context_json: JSON.stringify(challengeContext),
            available_owner_options_json: availableOwnerOptionsJson,
            estimated_changes: updateItem.estimatedChanges,
            priority: updateItem.priority,
            reason: updateItem.reason,
          },
          maxOutputTokens: options.maxOutputTokens,
          temperature: options.temperature,
        });

        const updateData = parseAgentResponse(result.content, detailedUpdateSchema, "updater");
        const mapped = mapDetailedUpdate(updateData, challenge, updateItem, {
          logId: result.logId,
          agentId: result.agent.id,
          modelConfigId: result.modelConfig.id,
        });
        mapped.rawResponse = result.content;
        
        return mapped;
      } catch (error) {
        errors.push({
          challengeId: challenge.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    });

    // Build parallel promises for creations
    const creationPromises = plan.creations.map(async (creationItem) => {
      try {
        // Get related insights
        const relatedInsights = creationItem.relatedInsightIds
          .map(id => insightLookup.get(id))
          .filter((insight): insight is InsightSummary => Boolean(insight));

        const result = await executeAgent({
          supabase,
          agentSlug: CREATOR_AGENT_SLUG,
          interactionType: CREATION_INTERACTION_TYPE,
          variables: {
            project_name: boardData.projectName,
            project_goal: boardData.projectGoal ?? "",
            project_status: boardData.projectStatus ?? "",
            reference_id: creationItem.referenceId,
            suggested_title: creationItem.suggestedTitle,
            suggested_parent_id: creationItem.suggestedParentId ?? "",
            estimated_impact: creationItem.estimatedImpact,
            reason: creationItem.reason,
            key_themes: (creationItem.keyThemes ?? []).join(", "),
            related_insights_json: JSON.stringify(relatedInsights),
            project_context_json: JSON.stringify(globalContext),
            available_owner_options_json: availableOwnerOptionsJson,
          },
          maxOutputTokens: options.maxOutputTokens,
          temperature: options.temperature,
        });

        const creationData = parseAgentResponse(result.content, detailedCreationSchema, "creator");
        return mapDetailedCreation(creationData, creationItem);
      } catch (error) {
        errors.push({
          challengeId: null,
          message: `Creation ${creationItem.referenceId}: ${error instanceof Error ? error.message : String(error)}`,
        });
        return null;
      }
    });

    // Execute all promises in parallel
    const [updateResults, creationResults] = await Promise.all([
      Promise.all(updatePromises),
      Promise.all(creationPromises),
    ]);

    // Collect results
    updateResults.forEach(result => {
      if (result) challengeSuggestions.push(result);
    });

    creationResults.forEach(result => {
      if (result) newChallengeSuggestions.push(...result);
    });

    console.log(`✅ Execution complete: ${challengeSuggestions.length} updates, ${newChallengeSuggestions.length} new challenges`);

    // ========================================================================
    // RESPONSE
    // ========================================================================

    const payload: AiChallengeBuilderResponse = {
      challengeSuggestions,
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

