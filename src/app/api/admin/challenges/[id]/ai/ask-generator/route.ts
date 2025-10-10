import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { fetchProjectJourneyContext } from "@/lib/projectJourneyLoader";
import { executeAgent } from "@/lib/ai/service";
import { parseErrorMessage } from "@/lib/utils";
import {
  type AiAskGeneratorResponse,
  type AiAskInsightReference,
  type AiAskParticipantSuggestion,
  type AiAskSuggestion,
  type ApiResponse,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
} from "@/types";

const DEFAULT_AGENT_SLUG = "ask-generator";
const INTERACTION_TYPE = "challenge.ask.generator";

const requestSchema = z
  .object({
    agentSlug: z.string().trim().min(1).optional(),
    maxOutputTokens: z.number().int().positive().max(4096).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

const deliveryModes = ["physical", "digital"] as const;
const audienceScopes = ["individual", "group"] as const;
const responseModes = ["collective", "simultaneous"] as const;
const urgencyLevels = ["low", "medium", "high", "critical"] as const;
const confidenceLevels = ["low", "medium", "high"] as const;

const participantSuggestionSchema = z.object({
  id: z.string().trim().min(1).optional().nullable(),
  name: z.string().trim().min(1),
  role: z.string().trim().min(1).optional().nullable(),
  isSpokesperson: z.boolean().optional().nullable(),
});

const insightReferenceSchema = z.object({
  insightId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional().nullable(),
  reason: z.string().trim().min(1).optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
});

const askSuggestionSchema = z.object({
  referenceId: z.string().trim().min(1).optional().nullable(),
  title: z.string().trim().min(3),
  askKey: z.string().trim().min(3).max(255).regex(/^[a-zA-Z0-9._-]+$/).optional().nullable(),
  question: z.string().trim().min(5),
  summary: z.string().trim().min(1).optional().nullable(),
  description: z.string().trim().min(1).optional().nullable(),
  objective: z.string().trim().min(1).optional().nullable(),
  recommendedParticipants: z.array(participantSuggestionSchema).optional(),
  relatedInsights: z.array(insightReferenceSchema).optional(),
  followUpActions: z.array(z.string().trim().min(1)).optional(),
  confidence: z.enum(confidenceLevels).optional().nullable(),
  urgency: z.enum(urgencyLevels).optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  isAnonymous: z.boolean().optional().nullable(),
  deliveryMode: z.enum(deliveryModes).optional().nullable(),
  audienceScope: z.enum(audienceScopes).optional().nullable(),
  responseMode: z.enum(responseModes).optional().nullable(),
  startDate: z.string().trim().min(4).optional().nullable(),
  endDate: z.string().trim().min(4).optional().nullable(),
});

type ParsedSuggestion = z.infer<typeof askSuggestionSchema>;

function sanitizeJsonString(jsonString: string): string {
  return jsonString
    .replace(/^[^\[{]+/, "")
    .replace(/[^\]}]+$/, "")
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/'(\s*[:,\]}])/g, '"$1')
    .replace(/"(\s*[:,\]}])/g, '"$1')
    .replace(/\u0000/g, "");
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

  const firstBrace = trimmed.indexOf("{");
  if (firstBrace === -1) {
    return trimmed;
  }

  let braceCount = 0;
  let lastBrace = -1;

  for (let index = firstBrace; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "{") {
      braceCount += 1;
    } else if (character === "}") {
      braceCount -= 1;
      if (braceCount === 0) {
        lastBrace = index;
        break;
      }
    }
  }

  if (lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  const fallback = trimmed.match(/\{[\s\S]*\}/);
  return fallback ? fallback[0] : trimmed;
}

function normaliseSuggestionPayload(payload: unknown): ParsedSuggestion[] {
  if (Array.isArray(payload)) {
    return payload.map(item => askSuggestionSchema.parse(item));
  }

  if (payload && typeof payload === "object") {
    const container = payload as Record<string, unknown>;
    const possibleKeys = ["suggestions", "asks", "sessions", "data", "items"];

    for (const key of possibleKeys) {
      const value = container[key];
      if (Array.isArray(value)) {
        return value.map(item => askSuggestionSchema.parse(item));
      }
    }

    return [askSuggestionSchema.parse(container)];
  }

  throw new Error("Agent response does not contain ASK suggestions");
}

function parseAskSuggestions(rawContent: string): ParsedSuggestion[] {
  const candidate = extractJsonCandidate(rawContent);
  const attempts = [candidate, sanitizeJsonString(candidate), candidate.replace(/'/g, '"')];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      return normaliseSuggestionPayload(parsed);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? new Error(`Invalid JSON response from agent: ${lastError.message}`)
    : new Error("Invalid JSON response from agent");
}

function flattenChallengeTree(nodes: ProjectChallengeNode[]): ProjectChallengeNode[] {
  return nodes.flatMap(node => [node, ...(node.children ? flattenChallengeTree(node.children) : [])]);
}

function buildInsightSummaries(boardData: ProjectJourneyBoardData, challengeId: string) {
  const summaries = new Map<string, Record<string, unknown>>();

  boardData.asks.forEach(ask => {
    ask.insights.forEach(insight => {
      if (!insight.relatedChallengeIds.includes(challengeId)) {
        return;
      }

      const existing = summaries.get(insight.id);
      const baseContributors = (insight.contributors ?? []).map(contributor => ({
        id: contributor.id,
        name: contributor.name,
        role: contributor.role ?? null,
      }));

      if (existing) {
        const seen = new Set((existing.contributors as Array<{ id?: string; name?: string }>)?.map(item => item.id ?? item.name));
        const mergedContributors = [...(existing.contributors as Array<{ id?: string; name?: string; role?: string | null }> ?? [])];
        baseContributors.forEach(contributor => {
          const key = contributor.id ?? contributor.name;
          if (key && !seen.has(key)) {
            seen.add(key);
            mergedContributors.push(contributor);
          }
        });
        existing.contributors = mergedContributors;
        summaries.set(insight.id, existing);
        return;
      }

      summaries.set(insight.id, {
        id: insight.id,
        title: insight.title,
        type: insight.type,
        description: insight.description,
        isCompleted: insight.isCompleted,
        askId: ask.id,
        askKey: ask.askKey,
        askTitle: ask.title,
        contributors: baseContributors,
      });
    });
  });

  return Array.from(summaries.values());
}

function buildExistingAskSummaries(
  boardData: ProjectJourneyBoardData,
  challengeId: string,
  askRows: any[],
) {
  const askRowById = new Map<string, any>();
  askRows.forEach(row => {
    if (row?.id) {
      askRowById.set(row.id, row);
    }
  });

  return boardData.asks
    .filter(ask => ask.originatingChallengeIds.includes(challengeId))
    .map(ask => {
      const raw = askRowById.get(ask.id) ?? {};
      return {
        id: ask.id,
        askKey: ask.askKey,
        title: ask.title,
        status: ask.status,
        summary: ask.summary,
        question: raw.question ?? null,
        description: raw.description ?? null,
        startDate: raw.start_date ?? null,
        endDate: raw.end_date ?? null,
        participants: ask.participants.map(participant => ({
          id: participant.id,
          name: participant.name,
          role: participant.role,
          isSpokesperson: participant.role?.toLowerCase() === "spokesperson",
        })),
        insights: ask.insights
          .filter(insight => insight.relatedChallengeIds.includes(challengeId))
          .map(insight => ({
            id: insight.id,
            title: insight.title,
            type: insight.type,
            isCompleted: insight.isCompleted,
          })),
      } satisfies Record<string, unknown>;
    });
}

function mapSuggestionToResponse(payload: ParsedSuggestion): AiAskSuggestion {
  const participants: AiAskParticipantSuggestion[] | undefined = payload.recommendedParticipants?.map(participant => ({
    id: participant.id ?? null,
    name: participant.name,
    role: participant.role ?? null,
    isSpokesperson: participant.isSpokesperson ?? null,
  }));

  const insights: AiAskInsightReference[] | undefined = payload.relatedInsights?.map(reference => ({
    insightId: reference.insightId,
    title: reference.title ?? null,
    reason: reference.reason ?? null,
    priority: reference.priority ?? null,
  }));

  return {
    referenceId: payload.referenceId ?? null,
    title: payload.title,
    askKey: payload.askKey ?? null,
    question: payload.question,
    summary: payload.summary ?? null,
    description: payload.description ?? null,
    objective: payload.objective ?? null,
    recommendedParticipants: participants,
    relatedInsights: insights,
    followUpActions: payload.followUpActions,
    confidence: payload.confidence ?? null,
    urgency: payload.urgency ?? null,
    maxParticipants: payload.maxParticipants ?? null,
    isAnonymous: payload.isAnonymous ?? null,
    deliveryMode: payload.deliveryMode ?? null,
    audienceScope: payload.audienceScope ?? null,
    responseMode: payload.responseMode ?? null,
    startDate: payload.startDate ?? null,
    endDate: payload.endDate ?? null,
  } satisfies AiAskSuggestion;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const challengeId = z.string().uuid().parse(params.id);
    const options = requestSchema?.parse(await request.json().catch(() => ({}))) ?? {};

    const supabase = getAdminSupabaseClient();

    const { data: challengeRow, error: challengeError } = await supabase
      .from("challenges")
      .select("id, project_id")
      .eq("id", challengeId)
      .maybeSingle();

    if (challengeError) {
      throw challengeError;
    }

    if (!challengeRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Challenge not found",
      }, { status: 404 });
    }

    const projectId: string = challengeRow.project_id;

    const context = await fetchProjectJourneyContext(supabase, projectId);
    const { boardData } = context;
    const challenges = flattenChallengeTree(boardData.challenges);
    const targetChallenge = challenges.find(item => item.id === challengeId);

    if (!targetChallenge) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Challenge data unavailable",
      }, { status: 404 });
    }

    const insightSummaries = buildInsightSummaries(boardData, challengeId);
    const existingAsks = buildExistingAskSummaries(boardData, challengeId, context.askRows);

    const challengeContext = {
      project: {
        id: boardData.projectId,
        name: boardData.projectName,
        goal: boardData.projectGoal,
        status: boardData.projectStatus,
        timeframe: boardData.timeframe,
        description: boardData.projectDescription,
      },
      challenge: {
        id: targetChallenge.id,
        title: targetChallenge.title,
        description: targetChallenge.description,
        status: targetChallenge.status,
        impact: targetChallenge.impact,
        owners: targetChallenge.owners ?? [],
        relatedInsightCount: insightSummaries.length,
        existingAskCount: existingAsks.length,
      },
      insights: insightSummaries,
      existingAsks,
    } satisfies Record<string, unknown>;

    const aiResult = await executeAgent({
      supabase,
      agentSlug: options.agentSlug ?? DEFAULT_AGENT_SLUG,
      askSessionId: null,
      messageId: null,
      interactionType: INTERACTION_TYPE,
      variables: {
        project_name: boardData.projectName,
        project_goal: boardData.projectGoal ?? "",
        project_status: boardData.projectStatus ?? "",
        challenge_id: targetChallenge.id,
        challenge_title: targetChallenge.title,
        challenge_description: targetChallenge.description ?? "",
        challenge_status: targetChallenge.status ?? "",
        challenge_impact: targetChallenge.impact,
        challenge_context_json: JSON.stringify(challengeContext),
        insights_json: JSON.stringify(insightSummaries),
        existing_asks_json: JSON.stringify(existingAsks),
        current_date: new Date().toISOString(),
      },
      maxOutputTokens: options.maxOutputTokens,
      temperature: options.temperature,
    });

    const parsedSuggestions = parseAskSuggestions(aiResult.content);
    const suggestions = parsedSuggestions.map(mapSuggestionToResponse);

    const payload: AiAskGeneratorResponse = {
      suggestions,
      errors: suggestions.length === 0 ? ["L'agent n'a proposé aucune nouvelle ASK pour ce challenge."] : undefined,
      rawResponse: aiResult.content,
    };

    return NextResponse.json<ApiResponse<AiAskGeneratorResponse>>({
      success: true,
      data: payload,
    });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError ? error.errors[0]?.message ?? "Invalid request" : parseErrorMessage(error),
    }, { status });
  }
}
