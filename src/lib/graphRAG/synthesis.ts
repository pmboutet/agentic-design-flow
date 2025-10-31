/**
 * Insight synthesis service for Graph RAG
 * Clusters related insights and generates unified syntheses using Anthropic AI
 */

import type { Insight } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { executeAgent } from "@/lib/ai/service";
import { generateEmbedding } from "@/lib/ai/embeddings";

export interface InsightCluster {
  insightIds: string[];
  insights: Insight[];
  similarityScore: number;
}

export interface SynthesisResult {
  id: string;
  synthesizedText: string;
  summary: string;
  keyConcepts: string[];
  commonThemes: string[];
  sourceInsightIds: string[];
}

/**
 * Find clusters of related insights using graph connections and vector similarity
 */
export async function findRelatedInsightClusters(
  supabase: SupabaseClient,
  projectId: string,
  threshold: number = 0.75,
  minClusterSize: number = 3
): Promise<InsightCluster[]> {
  // Get project's ask sessions to filter insights
  const { data: askSessions } = await supabase
    .from("ask_sessions")
    .select("id")
    .eq("project_id", projectId);

  if (!askSessions || askSessions.length === 0) {
    return [];
  }

  const askSessionIds = askSessions.map((s) => s.id);

  // Get all insights for the project that have embeddings
  const { data: insights, error } = await supabase
    .from("insights")
    .select(`
      id,
      content,
      summary,
      insight_type_id,
      insight_types(name),
      category,
      ask_session_id
    `)
    .in("ask_session_id", askSessionIds)
    .not("content_embedding", "is", null);

  if (error || !insights) {
    console.error("Error fetching insights for clustering:", error);
    return [];
  }

  if (insights.length < minClusterSize) {
    return [];
  }

  // Use graph edges to find clusters
  const clusters: InsightCluster[] = [];
  const processed = new Set<string>();

  // Map insights to Insight type for processing
  const projectInsights = insights.map((row: any) => ({
    id: row.id,
    content: row.content,
    summary: row.summary,
    type: row.insight_types?.name || 'idea',
    category: row.category,
    askSessionId: row.ask_session_id,
  })) as Insight[];

  for (const insight of projectInsights) {
    if (processed.has(insight.id)) {
      continue;
    }

    // Find insights connected via graph
    const { data: edges } = await supabase
      .from("knowledge_graph_edges")
      .select("target_id, similarity_score")
      .eq("source_id", insight.id)
      .eq("source_type", "insight")
      .eq("target_type", "insight")
      .in("relationship_type", ["SIMILAR_TO", "RELATED_TO"])
      .gte("similarity_score", threshold);

    if (!edges || edges.length === 0) {
      continue;
    }

    const relatedIds = edges.map((e) => e.target_id);
    const clusterInsights = projectInsights.filter((i) =>
      relatedIds.includes(i.id)
    );

    if (clusterInsights.length >= minClusterSize) {
      // Calculate average similarity
      const avgSimilarity =
        edges.reduce((sum, e) => sum + (e.similarity_score || 0), 0) /
        edges.length;

      clusters.push({
        insightIds: [insight.id, ...relatedIds],
        insights: [insight, ...clusterInsights] as Insight[],
        similarityScore: avgSimilarity,
      });

      // Mark all as processed
      processed.add(insight.id);
      relatedIds.forEach((id) => processed.add(id));
    }
  }

  return clusters;
}

/**
 * Synthesize a cluster of related insights using Anthropic AI
 */
export async function synthesizeInsightCluster(
  cluster: InsightCluster,
  projectName?: string,
  challengeName?: string
): Promise<SynthesisResult | null> {
  const supabase = getAdminSupabaseClient();

  try {
    // Prepare insights JSON for the agent
    const insightsJson = JSON.stringify(
      cluster.insights.map((insight) => ({
        id: insight.id,
        content: insight.content,
        summary: insight.summary || "",
        type: insight.type,
        category: insight.category || "",
      }))
    );

    // Call Anthropic agent for synthesis
    const result = await executeAgent({
      supabase,
      agentSlug: "insight-synthesis",
      interactionType: "insight.synthesis",
      variables: {
        project_name: projectName || "",
        challenge_name: challengeName || "",
        insights_json: insightsJson,
        insight_count: cluster.insights.length.toString(),
      },
    });

    // Parse the response
    let synthesisData: {
      synthesized_text: string;
      key_concepts: string[];
      common_themes: string[];
      summary: string;
    };

    try {
      let jsonStr = result.content.trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      synthesisData = JSON.parse(jsonStr);
    } catch (error) {
      console.error("Error parsing synthesis response:", error);
      return null;
    }

    // Generate embedding for synthesized text
    const embedding = await generateEmbedding(synthesisData.synthesized_text);

    // Get project and challenge IDs from first insight
    const firstInsight = cluster.insights[0];
    
    // Get ask_session_id from the insight row (it should have ask_session_id field)
    const { data: insightRow } = await supabase
      .from("insights")
      .select("ask_session_id")
      .eq("id", firstInsight.id)
      .maybeSingle();

    if (!insightRow?.ask_session_id) {
      console.error("No ask_session_id found for insight:", firstInsight.id);
      return null;
    }

    const { data: askSession } = await supabase
      .from("ask_sessions")
      .select("project_id, challenge_id")
      .eq("id", insightRow.ask_session_id)
      .maybeSingle();

    // Create synthesis record
    const { data: synthesis, error: insertError } = await supabase
      .from("insight_syntheses")
      .insert({
        project_id: askSession?.project_id || null,
        challenge_id: askSession?.challenge_id || null,
        synthesized_text: synthesisData.synthesized_text,
        source_insight_ids: cluster.insightIds,
        key_concepts: [], // Will be populated from key_concepts strings
        embedding: embedding,
      })
      .select("id, synthesized_text, source_insight_ids, key_concepts, created_at")
      .single();

    if (insertError || !synthesis) {
      console.error("Error creating synthesis:", insertError);
      return null;
    }

    // Link concepts to knowledge entities and update key_concepts
    const conceptEntityIds: string[] = [];
    for (const conceptText of synthesisData.key_concepts || []) {
      // Find or create entity for concept
      const { data: entity } = await supabase
        .from("knowledge_entities")
        .select("id")
        .eq("name", conceptText.toLowerCase().trim())
        .eq("type", "concept")
        .maybeSingle();

      if (entity) {
        conceptEntityIds.push(entity.id);
      }
    }

    if (conceptEntityIds.length > 0) {
      await supabase
        .from("insight_syntheses")
        .update({ key_concepts: conceptEntityIds })
        .eq("id", synthesis.id);
    }

    // Create SYNTHESIZES edges from synthesis to source insights
    const edges = cluster.insightIds.map((insightId) => ({
      source_id: synthesis.id,
      source_type: "synthesis",
      target_id: insightId,
      target_type: "insight",
      relationship_type: "SYNTHESIZES",
      confidence: cluster.similarityScore,
    }));

    await supabase.from("knowledge_graph_edges").insert(edges);

    return {
      id: synthesis.id,
      synthesizedText: synthesisData.synthesized_text,
      summary: synthesisData.summary || synthesisData.synthesized_text.substring(0, 200),
      keyConcepts: synthesisData.key_concepts || [],
      commonThemes: synthesisData.common_themes || [],
      sourceInsightIds: cluster.insightIds,
    };
  } catch (error) {
    console.error("Error synthesizing insight cluster:", error);
    return null;
  }
}

/**
 * Update syntheses for a project
 */
export async function updateSynthesesForProject(
  projectId: string
): Promise<SynthesisResult[]> {
  const supabase = getAdminSupabaseClient();

  try {
    // Get project info
    const { data: project } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle();

    // Find clusters
    const clusters = await findRelatedInsightClusters(
      supabase,
      projectId,
      0.75,
      3
    );

    const results: SynthesisResult[] = [];

    // Synthesize each cluster
    for (const cluster of clusters) {
      const result = await synthesizeInsightCluster(
        cluster,
        project?.name || undefined
      );
      if (result) {
        results.push(result);
      }
    }

    return results;
  } catch (error) {
    console.error("Error updating syntheses for project:", error);
    return [];
  }
}

