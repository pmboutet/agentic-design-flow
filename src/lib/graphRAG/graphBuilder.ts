/**
 * Graph builder service for Graph RAG
 * Creates edges between insights, entities, and challenges based on similarity and relationships
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { generateEmbedding } from "@/lib/ai/embeddings";

export type RelationshipType =
  | "SIMILAR_TO"
  | "RELATED_TO"
  | "CONTAINS"
  | "SYNTHESIZES"
  | "MENTIONS";

interface GraphEdge {
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  relationshipType: RelationshipType;
  similarityScore?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create or update a graph edge
 */
async function upsertGraphEdge(
  supabase: SupabaseClient,
  edge: GraphEdge
): Promise<void> {
  const { error, data } = await supabase.from("knowledge_graph_edges").upsert(
    {
      source_id: edge.sourceId,
      source_type: edge.sourceType,
      target_id: edge.targetId,
      target_type: edge.targetType,
      relationship_type: edge.relationshipType,
      similarity_score: edge.similarityScore ?? null,
      confidence: edge.confidence ?? null,
      metadata: edge.metadata ?? null,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "source_id,source_type,target_id,target_type,relationship_type",
      ignoreDuplicates: false,
    }
  ).select();

  if (error) {
    // If error is about unique constraint violation, the edge already exists (which is fine)
    if (error.code === '23505' || error.message.includes('unique constraint') || error.message.includes('duplicate key')) {
      console.log(`[Graph RAG] Edge already exists: ${edge.sourceType}:${edge.sourceId} -> ${edge.relationshipType} -> ${edge.targetType}:${edge.targetId}`);
      return;
    }
    console.error(`[Graph RAG] Error upserting graph edge from ${edge.sourceId} to ${edge.targetId}:`, error);
    throw new Error(`Failed to create graph edge: ${error.message}`);
  }
  
  if (data && data.length > 0) {
    console.log(`[Graph RAG] Created/updated edge: ${edge.sourceType}:${edge.sourceId} -> ${edge.relationshipType} -> ${edge.targetType}:${edge.targetId}`);
  }
}

/**
 * Find similar insights using vector similarity
 */
async function findSimilarInsights(
  supabase: SupabaseClient,
  insightId: string,
  embedding: number[],
  threshold: number = 0.75,
  limit: number = 10
): Promise<Array<{ id: string; similarity: number }>> {
  // Supabase accepts number arrays directly for vector types
  const { data, error } = await supabase.rpc("find_similar_insights", {
    query_embedding: embedding, // Pass array directly, Supabase converts to vector
    match_threshold: threshold,
    match_count: limit,
    exclude_id: insightId,
  });

  if (error) {
    console.error("Error finding similar insights:", error);
    // Return empty array on error (function might not exist yet, will be created after migration)
    return [];
  }

  return (data || []).map((item: { id: string; similarity: number }) => ({
    id: item.id,
    similarity: item.similarity,
  }));
}

/**
 * Build similarity edges between insights
 */
export async function buildSimilarityEdges(
  supabase: SupabaseClient,
  insightId: string,
  embedding: number[]
): Promise<void> {
  console.log(`[Graph RAG] Building similarity edges for insight ${insightId}...`);
  const similarInsights = await findSimilarInsights(
    supabase,
    insightId,
    embedding,
    0.75,
    10
  );

  console.log(`[Graph RAG] Found ${similarInsights.length} similar insights for ${insightId}`);

  if (similarInsights.length === 0) {
    return;
  }

  const edges: GraphEdge[] = similarInsights.map((similar) => ({
    sourceId: insightId,
    sourceType: "insight",
    targetId: similar.id,
    targetType: "insight",
    relationshipType: "SIMILAR_TO",
    similarityScore: similar.similarity,
    confidence: similar.similarity, // Use similarity as confidence
  }));

  // Also create reverse edges (bidirectional)
  const reverseEdges: GraphEdge[] = similarInsights.map((similar) => ({
    sourceId: similar.id,
    sourceType: "insight",
    targetId: insightId,
    targetType: "insight",
    relationshipType: "SIMILAR_TO",
    similarityScore: similar.similarity,
    confidence: similar.similarity,
  }));

  // Upsert all edges
  for (const edge of [...edges, ...reverseEdges]) {
    try {
      await upsertGraphEdge(supabase, edge);
    } catch (error) {
      console.error(`Error creating similarity edge for ${insightId}:`, error);
    }
  }
}

/**
 * Build conceptual edges linking insights to entities they mention
 */
export async function buildConceptualEdges(
  supabase: SupabaseClient,
  insightId: string
): Promise<void> {
  console.log(`[Graph RAG] Building conceptual edges for insight ${insightId}...`);
  // Get all entities linked to this insight
  const { data: keywords, error } = await supabase
    .from("insight_keywords")
    .select("entity_id, relevance_score")
    .eq("insight_id", insightId);

  if (error) {
    console.error(`[Graph RAG] Error fetching insight keywords for ${insightId}:`, error);
    return;
  }

  if (!keywords || keywords.length === 0) {
    console.log(`[Graph RAG] No keywords found for insight ${insightId}, skipping conceptual edges`);
    return;
  }

  console.log(`[Graph RAG] Found ${keywords.length} keywords for insight ${insightId}, creating conceptual edges`);

  const edges: GraphEdge[] = keywords.map((kw) => ({
    sourceId: insightId,
    sourceType: "insight",
    targetId: kw.entity_id,
    targetType: "entity",
    relationshipType: "MENTIONS",
    confidence: kw.relevance_score,
  }));

  // Find other insights that mention the same entities (RELATED_TO via common entities)
  const entityIds = keywords.map((kw) => kw.entity_id);

  const { data: relatedInsights } = await supabase
    .from("insight_keywords")
    .select("insight_id")
    .in("entity_id", entityIds)
    .neq("insight_id", insightId);

  if (relatedInsights) {
    const relatedInsightIds = [
      ...new Set(relatedInsights.map((r) => r.insight_id)),
    ];

    for (const relatedId of relatedInsightIds) {
      edges.push({
        sourceId: insightId,
        sourceType: "insight",
        targetId: relatedId,
        targetType: "insight",
        relationshipType: "RELATED_TO",
        confidence: 0.7, // Moderate confidence for entity-based relationships
        metadata: {
          via_entities: entityIds,
        },
      });
    }
  }

  // Upsert all edges
  for (const edge of edges) {
    try {
      await upsertGraphEdge(supabase, edge);
    } catch (error) {
      console.error(`Error creating conceptual edge for ${insightId}:`, error);
    }
  }
}

/**
 * Build edges linking insights to challenges
 */
export async function buildChallengeEdges(
  supabase: SupabaseClient,
  insightId: string
): Promise<void> {
  // Get insight to find related challenges
  const { data: insight, error: insightError } = await supabase
    .from("insights")
    .select("challenge_id, related_challenge_ids")
    .eq("id", insightId)
    .single();

  if (insightError || !insight) {
    console.error("Error fetching insight:", insightError);
    return;
  }

  const challengeIds: string[] = [];

  if (insight.challenge_id) {
    challengeIds.push(insight.challenge_id);
  }

  if (Array.isArray(insight.related_challenge_ids)) {
    challengeIds.push(...insight.related_challenge_ids);
  }

  // Also check challenge_insights junction table
  const { data: challengeInsights } = await supabase
    .from("challenge_insights")
    .select("challenge_id")
    .eq("insight_id", insightId);

  if (challengeInsights) {
    for (const ci of challengeInsights) {
      if (!challengeIds.includes(ci.challenge_id)) {
        challengeIds.push(ci.challenge_id);
      }
    }
  }

  const edges: GraphEdge[] = challengeIds.map((challengeId) => ({
    sourceId: insightId,
    sourceType: "insight",
    targetId: challengeId,
    targetType: "challenge",
    relationshipType: "RELATED_TO",
    confidence: 0.8,
  }));

  // Upsert all edges
  for (const edge of edges) {
    try {
      await upsertGraphEdge(supabase, edge);
    } catch (error) {
      console.error(`Error creating challenge edge for ${insightId}:`, error);
    }
  }
}

/**
 * Build all graph edges for an insight
 */
export async function buildAllEdgesForInsight(
  insightId: string,
  embedding?: number[],
  supabase?: ReturnType<typeof getAdminSupabaseClient>
): Promise<void> {
  const client = supabase || getAdminSupabaseClient();

  try {
    // Build similarity edges if embedding is provided
    if (embedding) {
      await buildSimilarityEdges(client, insightId, embedding);
    }

    // Build conceptual edges
    await buildConceptualEdges(client, insightId);

    // Build challenge edges
    await buildChallengeEdges(client, insightId);
  } catch (error) {
    console.error(`Error building edges for insight ${insightId}:`, error);
    throw error;
  }
}

/**
 * Delete all graph edges related to an insight (as source or target)
 * Also cleans up insight_keywords relationships
 */
export async function deleteEdgesForInsight(
  insightId: string,
  supabase?: ReturnType<typeof getAdminSupabaseClient>
): Promise<void> {
  const client = supabase || getAdminSupabaseClient();

  console.log(`[Graph RAG] Deleting all edges for insight ${insightId}...`);

  try {
    // Delete edges where insight is the source
    const { error: sourceError } = await client
      .from("knowledge_graph_edges")
      .delete()
      .eq("source_id", insightId)
      .eq("source_type", "insight");

    if (sourceError) {
      console.error(`[Graph RAG] Error deleting source edges for ${insightId}:`, sourceError);
    }

    // Delete edges where insight is the target
    const { error: targetError } = await client
      .from("knowledge_graph_edges")
      .delete()
      .eq("target_id", insightId)
      .eq("target_type", "insight");

    if (targetError) {
      console.error(`[Graph RAG] Error deleting target edges for ${insightId}:`, targetError);
    }

    // Delete insight_keywords relationships
    const { error: keywordsError } = await client
      .from("insight_keywords")
      .delete()
      .eq("insight_id", insightId);

    if (keywordsError) {
      console.error(`[Graph RAG] Error deleting keywords for ${insightId}:`, keywordsError);
    }

    console.log(`[Graph RAG] Successfully deleted all edges and keywords for insight ${insightId}`);
  } catch (error) {
    console.error(`[Graph RAG] Error in deleteEdgesForInsight for ${insightId}:`, error);
    throw error;
  }
}

/**
 * Rebuild all graph data for an insight: delete old edges, regenerate embeddings, extract entities, rebuild edges
 * Used when insight content is manually modified
 */
export async function rebuildGraphForInsight(
  insightId: string,
  newContent: string,
  supabase?: ReturnType<typeof getAdminSupabaseClient>
): Promise<void> {
  const client = supabase || getAdminSupabaseClient();

  console.log(`[Graph RAG] Rebuilding graph for insight ${insightId}...`);

  try {
    // Step 1: Delete existing edges and keywords
    await deleteEdgesForInsight(insightId, client);

    // Step 2: Generate new content embedding
    const contentEmbedding = await generateEmbedding(newContent).catch((err) => {
      console.error(`[Graph RAG] Error generating embedding for insight ${insightId}:`, err);
      return null;
    });

    // Step 3: Update insight with new embedding
    if (contentEmbedding) {
      const { error: updateError } = await client
        .from("insights")
        .update({
          content_embedding: contentEmbedding,
          summary_embedding: null, // Clear summary embedding since summary is now null
          embedding_updated_at: new Date().toISOString(),
        })
        .eq("id", insightId);

      if (updateError) {
        console.error(`[Graph RAG] Error updating embedding for ${insightId}:`, updateError);
      }
    }

    // Step 4: Extract new entities using AI
    const { extractEntitiesFromInsight, storeInsightKeywords, generateEntityEmbeddings } =
      await import("@/lib/graphRAG/extractEntities");
    const { mapInsightRowToInsight } = await import("@/lib/insights");

    // Fetch the updated insight row
    const { data: insightRow, error: fetchError } = await client
      .from("insights")
      .select("*")
      .eq("id", insightId)
      .single();

    if (fetchError || !insightRow) {
      console.error(`[Graph RAG] Error fetching insight ${insightId}:`, fetchError);
      return;
    }

    const insight = mapInsightRowToInsight(insightRow);

    // Extract entities
    const { entityIds, keywords } = await extractEntitiesFromInsight(insight);

    // Store insight-keyword relationships
    if (keywords.length > 0) {
      await storeInsightKeywords(client, insightId, keywords);
    }

    // Generate embeddings for new entities
    if (entityIds.length > 0) {
      await generateEntityEmbeddings(client, entityIds);
    }

    // Step 5: Rebuild all edges
    await buildAllEdgesForInsight(insightId, contentEmbedding || undefined, client);

    console.log(`[Graph RAG] Successfully rebuilt graph for insight ${insightId}`);
  } catch (error) {
    console.error(`[Graph RAG] Error in rebuildGraphForInsight for ${insightId}:`, error);
    // Don't throw - we don't want to block the update if graph rebuild fails
  }
}

