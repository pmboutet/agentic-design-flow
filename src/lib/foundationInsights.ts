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

function mapChallengeFoundationInsight(record: any): ChallengeFoundationInsight {
  return {
    id: record.id,
    challengeId: record.challenge_id,
    insightId: record.insight_id,
    priority: record.priority,
    reason: record.reason ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    insight: record.insight
      ? {
          id: record.insight.id,
          content: record.insight.content,
          summary: record.insight.summary ?? null,
          type: record.insight.insight_type,
          category: record.insight.category ?? null,
          status: record.insight.status,
        }
      : undefined,
  };
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
