import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import {
  type ApiResponse,
  type ProjectAskOverview,
  type ProjectAskParticipant,
  type ProjectChallengeNode,
  type ProjectJourneyBoardData,
  type ProjectParticipantInsight,
  type ProjectParticipantOption,
  type ProjectParticipantSummary,
} from "@/types";

const IMPACT_LEVELS: ProjectChallengeNode["impact"][] = ["low", "medium", "high", "critical"];

const COMPLETED_INSIGHT_STATUSES = new Set(["implemented", "archived", "resolved", "closed"]);

const INSIGHT_TYPE_FALLBACK: ProjectParticipantInsight["type"] = "signal";

function normalizeImpact(priority?: string | null): ProjectChallengeNode["impact"] {
  if (!priority) {
    return "medium";
  }

  const normalized = priority.toLowerCase();
  if ((IMPACT_LEVELS as string[]).includes(normalized)) {
    return normalized as ProjectChallengeNode["impact"];
  }

  return "medium";
}

function normalizeInsightType(value?: string | null): ProjectParticipantInsight["type"] {
  if (!value) {
    return INSIGHT_TYPE_FALLBACK;
  }
  const normalized = value.toLowerCase();
  switch (normalized) {
    case "pain":
    case "gain":
    case "signal":
    case "idea":
      return normalized;
    default:
      return INSIGHT_TYPE_FALLBACK;
  }
}

function formatTimeframe(startDate?: string | null, endDate?: string | null): string | null {
  if (!startDate && !endDate) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
  });

  const safeStart = startDate ? new Date(startDate) : null;
  const safeEnd = endDate ? new Date(endDate) : null;

  const startLabel = safeStart && !Number.isNaN(safeStart.getTime()) ? formatter.format(safeStart) : null;
  const endLabel = safeEnd && !Number.isNaN(safeEnd.getTime()) ? formatter.format(safeEnd) : null;

  if (startLabel && endLabel) {
    return `${startLabel} – ${endLabel}`;
  }
  return startLabel ?? endLabel;
}

function initialsFromName(name: string): string {
  if (!name) {
    return "??";
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function buildChallengeTree(
  rows: any[],
  relatedInsightMap: Map<string, string[]>,
  ownerMap: Map<string, ProjectParticipantSummary>,
): ProjectChallengeNode[] {
  const nodeMap = new Map<string, ProjectChallengeNode & { children: ProjectChallengeNode[] }>();
  const roots: ProjectChallengeNode[] = [];

  for (const row of rows) {
    const owners: ProjectParticipantSummary[] = [];
    const assignedId = row.assigned_to ? String(row.assigned_to) : null;
    if (assignedId) {
      const owner = ownerMap.get(assignedId);
      if (owner) {
        owners.push(owner);
      }
    }

    const node: ProjectChallengeNode & { children: ProjectChallengeNode[] } = {
      id: row.id,
      title: row.name,
      description: row.description ?? "",
      status: row.status ?? "open",
      impact: normalizeImpact(row.priority),
      owners,
      relatedInsightIds: relatedInsightMap.get(row.id) ?? [],
      children: [],
    };

    nodeMap.set(node.id, node);
  }

  for (const row of rows) {
    const node = nodeMap.get(row.id);
    if (!node) {
      continue;
    }

    const parentId = row.parent_challenge_id;
    if (parentId && nodeMap.has(parentId)) {
      const parent = nodeMap.get(parentId)!;
      parent.children = parent.children ? [...parent.children, node] : [node];
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function buildParticipantSummary(row: any): ProjectParticipantSummary {
  const name = row.participant_name || row.users?.full_name || row.users?.email || row.participant_email || "Participant";
  return {
    id: row.id,
    name,
    role: row.role ?? undefined,
  };
}

function mapParticipant(row: any): ProjectAskParticipant {
  const summary = buildParticipantSummary(row);
  return {
    id: row.id,
    userId: row.user_id ?? null,
    name: summary.name,
    role: summary.role ?? "participant",
    avatarInitials: initialsFromName(summary.name),
    avatarColor: undefined,
    insights: [],
  };
}

function buildInsight(
  row: any,
  relatedChallenges: string[],
  contributor?: ProjectParticipantSummary,
): ProjectParticipantInsight {
  const title = row.summary?.trim() || row.content?.slice(0, 80) || "Insight";
  return {
    id: row.id,
    title,
    type: normalizeInsightType(row.insight_type),
    description: row.content ?? row.summary ?? "",
    updatedAt: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    isCompleted: COMPLETED_INSIGHT_STATUSES.has((row.status ?? "").toLowerCase()),
    relatedChallengeIds: relatedChallenges,
    kpis: [],
    contributors: contributor ? [contributor] : [],
  };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const projectId = z.string().uuid().parse(params.id);

    const supabase = getAdminSupabaseClient();

    const [projectResult, challengeResult, askResult] = await Promise.all([
      supabase
        .from("projects")
        .select("id, name, description, status, client_id, client:clients(name), start_date, end_date, system_prompt")
        .eq("id", projectId)
        .single(),
      supabase
        .from("challenges")
        .select(
          "id, name, description, status, priority, category, project_id, parent_challenge_id, assigned_to, due_date, system_prompt",
        )
        .eq("project_id", projectId),
      supabase
        .from("ask_sessions")
        .select(
          "id, ask_key, name, question, description, status, start_date, end_date, challenge_id, project_id",
        )
        .eq("project_id", projectId),
    ]);

    if (projectResult.error) {
      if (projectResult.error.code === "PGRST116" || projectResult.status === 406) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "Project not found",
        }, { status: 404 });
      }
      throw projectResult.error;
    }

    const projectRow = projectResult.data;
    if (!projectRow) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Project not found",
      }, { status: 404 });
    }

    if (challengeResult.error) {
      throw challengeResult.error;
    }
    if (askResult.error) {
      throw askResult.error;
    }

    const challengeRows = challengeResult.data ?? [];
    const askRows = askResult.data ?? [];

    const askIds = askRows.map(row => row.id);
    const challengeIds = challengeRows.map(row => row.id);

    const ownerIds = Array.from(
      new Set(
        challengeRows
          .map((row: any) => row.assigned_to)
          .filter((value: any): value is string => Boolean(value)),
      ),
    );

    const [participantResult, insightResult, challengeInsightResult, ownerResult] = await Promise.all([
      askIds.length
        ? supabase
            .from("ask_participants")
            .select(
              "id, ask_session_id, user_id, participant_name, participant_email, role, is_spokesperson, users(id, full_name, email, role)",
            )
            .in("ask_session_id", askIds)
        : Promise.resolve({ data: [], error: null }),
      askIds.length
        ? supabase
            .from("insights")
            .select("id, ask_session_id, user_id, content, summary, insight_type, status, updated_at, created_at, challenge_id")
            .in("ask_session_id", askIds)
        : Promise.resolve({ data: [], error: null }),
      challengeIds.length
        ? supabase
            .from("challenge_insights")
            .select("challenge_id, insight_id")
            .in("challenge_id", challengeIds)
        : Promise.resolve({ data: [], error: null }),
      ownerIds.length
        ? supabase
            .from("users")
            .select("id, full_name, email, role")
            .in("id", ownerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (participantResult.error) {
      throw participantResult.error;
    }
    if (insightResult.error) {
      throw insightResult.error;
    }
    if (challengeInsightResult.error) {
      throw challengeInsightResult.error;
    }
    if (ownerResult.error) {
      throw ownerResult.error;
    }

    const participantRows = participantResult.data ?? [];
    const insightRows = insightResult.data ?? [];
    const challengeInsightRows = challengeInsightResult.data ?? [];
    const ownerRows = ownerResult.data ?? [];

    const ownerMap = new Map<string, ProjectParticipantSummary>();
    for (const row of ownerRows) {
      ownerMap.set(row.id, {
        id: row.id,
        name: row.full_name || row.email || "Owner",
        role: row.role ?? undefined,
      });
    }

    const relatedInsightMap = new Map<string, string[]>();
    for (const row of challengeInsightRows) {
      const list = relatedInsightMap.get(row.challenge_id) ?? [];
      if (!list.includes(row.insight_id)) {
        list.push(row.insight_id);
      }
      relatedInsightMap.set(row.challenge_id, list);
    }

    // Build participant lookup maps
    const participantsByAskId = new Map<string, ProjectAskParticipant[]>();
    const participantSummaryByUserId = new Map<string, ProjectParticipantSummary>();
    const availableUsers = new Map<string, ProjectParticipantOption>();

    for (const row of participantRows) {
      const participant = mapParticipant(row);
      const list = participantsByAskId.get(row.ask_session_id) ?? [];
      list.push(participant);
      participantsByAskId.set(row.ask_session_id, list);

      if (row.user_id) {
        const summary = buildParticipantSummary(row);
        participantSummaryByUserId.set(row.user_id, summary);
        availableUsers.set(row.user_id, {
          id: row.user_id,
          name: summary.name,
          role: summary.role ?? "participant",
          avatarInitials: initialsFromName(summary.name),
          avatarColor: undefined,
        });
      }
    }

    for (const [userId, summary] of ownerMap.entries()) {
      if (!availableUsers.has(userId)) {
        availableUsers.set(userId, {
          id: userId,
          name: summary.name,
          role: summary.role ?? "owner",
          avatarInitials: initialsFromName(summary.name),
          avatarColor: undefined,
        });
      }
    }

    const insightsByAskId = new Map<string, ProjectParticipantInsight[]>();

    for (const row of insightRows) {
      const contributor = row.user_id ? participantSummaryByUserId.get(row.user_id) : undefined;
      const relatedChallenges = new Set<string>();

      if (row.challenge_id) {
        relatedChallenges.add(row.challenge_id);
      }

      const challengeIdsForInsight = challengeInsightRows
        .filter(item => item.insight_id === row.id)
        .map(item => item.challenge_id);
      challengeIdsForInsight.forEach(id => relatedChallenges.add(id));

      const insight = buildInsight(row, Array.from(relatedChallenges), contributor);
      const list = insightsByAskId.get(row.ask_session_id) ?? [];
      list.push(insight);
      insightsByAskId.set(row.ask_session_id, list);
    }

    // Attach insights to participants
    for (const [askId, participants] of participantsByAskId.entries()) {
      const askInsights = insightsByAskId.get(askId) ?? [];

      for (const participant of participants) {
        const matchingInsights = askInsights.filter(insight =>
          insight.contributors?.some(contributor => contributor.id === participant.id || contributor.name === participant.name),
        );

        if (matchingInsights.length > 0) {
          participant.insights = matchingInsights;
        } else {
          participant.insights = askInsights;
        }
      }
    }

    const challengeNodes = buildChallengeTree(challengeRows, relatedInsightMap, ownerMap);

    const askOverviews: ProjectAskOverview[] = askRows.map(row => {
      const participants = participantsByAskId.get(row.id) ?? [];
      const askInsights = insightsByAskId.get(row.id) ?? [];

      const originatingChallengeIds = new Set<string>();
      if (row.challenge_id) {
        originatingChallengeIds.add(row.challenge_id);
      }
      askInsights.forEach(insight => {
        insight.relatedChallengeIds.forEach(id => originatingChallengeIds.add(id));
      });

      return {
        id: row.id,
        title: row.name || row.ask_key,
        summary: row.description ?? row.question ?? "",
        status: row.status ?? "active",
        theme: "General",
        dueDate: row.end_date ?? row.start_date ?? new Date().toISOString(),
        originatingChallengeIds: Array.from(originatingChallengeIds),
        relatedProjects: [{ id: projectId, name: projectRow.name }],
        participants,
      };
    });

    const journeyData: ProjectJourneyBoardData = {
      projectId,
      projectName: projectRow.name,
      clientName: projectRow.client?.name ?? null,
      projectGoal: projectRow.description ?? null,
      timeframe: formatTimeframe(projectRow.start_date, projectRow.end_date),
      projectDescription: projectRow.description ?? null,
      projectStatus: projectRow.status ?? null,
      projectStartDate: projectRow.start_date ?? null,
      projectEndDate: projectRow.end_date ?? null,
      projectSystemPrompt: projectRow.system_prompt ?? null,
      asks: askOverviews,
      challenges: challengeNodes,
      availableUsers: Array.from(availableUsers.values()),
    };

    return NextResponse.json<ApiResponse<ProjectJourneyBoardData>>({
      success: true,
      data: journeyData,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: error.errors[0]?.message || "Invalid project id",
      }, { status: 400 });
    }

    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}
