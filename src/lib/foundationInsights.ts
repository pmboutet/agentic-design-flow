import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import type { AiFoundationInsight } from "@/types";

export interface ChallengeFoundationInsight {
  id: string;
  challengeId: string;
  insightId: string;
  priority: "low" | "medium" | "high" | "critical";
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
  insight?: {
    id: string;
    content: string;
    summary?: string | null;
    type: string;
    category?: string | null;
    status: string;
  };
}

interface ChallengeFoundationInsightRow {
  id: string;
  challenge_id: string;
  insight_id: string;
  priority: "low" | "medium" | "high" | "critical";
  reason: string | null;
  created_at: string;
  updated_at: string;
  insight?:
    | {
        id: string;
        content: string;
        summary: string | null;
        insight_type: string;
        category: string | null;
        status: string;
      }
    | Array<{
        id: string;
        content: string;
        summary: string | null;
        insight_type: string;
        category: string | null;
        status: string;
      }>
    | null;
}

function mapChallengeFoundationInsight(row: ChallengeFoundationInsightRow): ChallengeFoundationInsight {
  const base: ChallengeFoundationInsight = {
    id: row.id,
    challengeId: row.challenge_id,
    insightId: row.insight_id,
    priority: row.priority,
    reason: row.reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  const relatedInsight = Array.isArray(row.insight) ? row.insight[0] : row.insight;

  if (relatedInsight) {
    base.insight = {
      id: relatedInsight.id,
      content: relatedInsight.content,
      summary: relatedInsight.summary ?? null,
      type: relatedInsight.insight_type,
      category: relatedInsight.category ?? null,
      status: relatedInsight.status,
    };
  }

  return base;
}

/**
 * Create foundation insights links for a challenge
 */
export async function createChallengeFoundationInsights(
  challengeId: string,
  foundationInsights: AiFoundationInsight[]
): Promise<ChallengeFoundationInsight[]> {
  const supabase = getAdminSupabaseClient();
  
  if (!foundationInsights.length) {
    return [];
  }

  // First, clear existing foundation insights for this challenge
  await supabase
    .from('challenge_foundation_insights')
    .delete()
    .eq('challenge_id', challengeId);

  // Insert new foundation insights
  const foundationInsightData = foundationInsights.map(insight => ({
    challenge_id: challengeId,
    insight_id: insight.insightId,
    priority: insight.priority,
    reason: insight.reason,
  }));

  const { data, error } = await supabase
    .from('challenge_foundation_insights')
    .insert(foundationInsightData)
    .select(`
      id,
      challenge_id,
      insight_id,
      priority,
      reason,
      created_at,
      updated_at
    `);

  if (error) {
    console.error('Error creating challenge foundation insights:', error);
    throw new Error(`Failed to create foundation insights: ${error.message}`);
  }

  return (data ?? []).map(mapChallengeFoundationInsight);
}

/**
 * Get foundation insights for a challenge
 */
export async function getChallengeFoundationInsights(
  challengeId: string
): Promise<ChallengeFoundationInsight[]> {
  const supabase = getAdminSupabaseClient();

  const { data, error } = await supabase
    .from('challenge_foundation_insights')
    .select(`
      id,
      challenge_id,
      insight_id,
      priority,
      reason,
      created_at,
      updated_at,
      insight:insights(
        id,
        content,
        summary,
        insight_type,
        category,
        status
      )
    `)
    .eq('challenge_id', challengeId)
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error fetching challenge foundation insights:', error);
    throw new Error(`Failed to fetch foundation insights: ${error.message}`);
  }

  return (data ?? []).map(mapChallengeFoundationInsight);
}

/**
 * Delete foundation insights for a challenge
 */
export async function deleteChallengeFoundationInsights(
  challengeId: string
): Promise<void> {
  const supabase = getAdminSupabaseClient();

  const { error } = await supabase
    .from('challenge_foundation_insights')
    .delete()
    .eq('challenge_id', challengeId);

  if (error) {
    console.error('Error deleting challenge foundation insights:', error);
    throw new Error(`Failed to delete foundation insights: ${error.message}`);
  }
}

/**
 * Update foundation insights for a challenge
 */
export async function updateChallengeFoundationInsights(
  challengeId: string,
  foundationInsights: AiFoundationInsight[]
): Promise<ChallengeFoundationInsight[]> {
  // Delete existing and create new ones
  await deleteChallengeFoundationInsights(challengeId);
  return createChallengeFoundationInsights(challengeId, foundationInsights);
}
