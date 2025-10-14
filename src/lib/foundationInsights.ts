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
  console.log('🔍 createChallengeFoundationInsights - Start:', {
    challengeId,
    count: foundationInsights.length,
    insights: foundationInsights,
  });
  
  const supabase = getAdminSupabaseClient();
  
  if (!foundationInsights.length) {
    console.log('⚠️ createChallengeFoundationInsights - No insights to create');
    return [];
  }

  // First, clear existing foundation insights for this challenge
  console.log('🗑️ createChallengeFoundationInsights - Deleting existing foundation insights');
  const { error: deleteError } = await supabase
    .from('challenge_foundation_insights')
    .delete()
    .eq('challenge_id', challengeId);
  
  if (deleteError) {
    console.error('❌ createChallengeFoundationInsights - Delete error:', deleteError);
  }

  // Insert new foundation insights
  const foundationInsightData = foundationInsights.map(insight => ({
    challenge_id: challengeId,
    insight_id: insight.insightId,
    priority: insight.priority,
    reason: insight.reason,
  }));
  
  console.log('📝 createChallengeFoundationInsights - Inserting data:', foundationInsightData);

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
    console.error('❌ createChallengeFoundationInsights - Insert error:', error);
    throw new Error(`Failed to create foundation insights: ${error.message}`);
  }
  
  console.log('✅ createChallengeFoundationInsights - Inserted successfully:', data?.length);

  // Also create standard challenge-insight links so they appear in the UI
  // This ensures the insights are visible in the "Foundational insights" section
  console.log('🔗 createChallengeFoundationInsights - Creating challenge-insight links');
  
  for (const insight of foundationInsights) {
    console.log('🔍 Checking existing link for insight:', insight.insightId);
    
    // Check if link already exists
    const { data: existingLink, error: checkError } = await supabase
      .from('challenge_insights')
      .select('challenge_id, insight_id')
      .eq('challenge_id', challengeId)
      .eq('insight_id', insight.insightId)
      .maybeSingle();

    if (checkError) {
      console.error('❌ Error checking existing link:', checkError);
    }

    if (!existingLink) {
      console.log('📝 Creating new challenge-insight link:', { challengeId, insightId: insight.insightId });
      
      // Create new link if it doesn't exist
      const { error: insertError } = await supabase
        .from('challenge_insights')
        .insert({
          challenge_id: challengeId,
          insight_id: insight.insightId,
        });

      if (insertError) {
        console.error('❌ Error creating challenge-insight link:', insertError);
        // Don't throw here - foundation insights are already created
        // Just log the error
      } else {
        console.log('✅ Created challenge-insight link:', { challengeId, insightId: insight.insightId });
      }
    } else {
      console.log('ℹ️ Challenge-insight link already exists:', { challengeId, insightId: insight.insightId });
    }
  }
  
  console.log('✅ createChallengeFoundationInsights - Complete');

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
