/**
 * Entity extraction service for Graph RAG
 * Extracts keywords, concepts, and themes from insights using Anthropic AI
 */

import type { Insight } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAgent } from "@/lib/ai/service";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";

export interface ExtractedEntity {
  text: string;
  relevance: number;
  type: "concept" | "keyword" | "theme";
}

export interface ExtractedEntitiesResponse {
  keywords: ExtractedEntity[];
  concepts: string[];
  themes: string[];
}

/**
 * Normalize entity name for deduplication
 */
function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Remove accents for better matching
}

/**
 * Parse AI response and extract entities
 */
function parseEntityExtractionResponse(
  response: string
): ExtractedEntitiesResponse {
  try {
    // Remove markdown code blocks if present
    let jsonStr = response.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(jsonStr) as ExtractedEntitiesResponse;

    // Validate structure
    if (!parsed.keywords || !Array.isArray(parsed.keywords)) {
      parsed.keywords = [];
    }
    if (!parsed.concepts || !Array.isArray(parsed.concepts)) {
      parsed.concepts = [];
    }
    if (!parsed.themes || !Array.isArray(parsed.themes)) {
      parsed.themes = [];
    }

    return parsed;
  } catch (error) {
    console.error("Error parsing entity extraction response:", error);
    console.error("Response was:", response);
    // Return empty response on parse error
    return {
      keywords: [],
      concepts: [],
      themes: [],
    };
  }
}

/**
 * Find or create knowledge entity in database
 */
async function findOrCreateEntity(
  supabase: SupabaseClient,
  name: string,
  type: "concept" | "keyword" | "theme",
  description?: string
): Promise<string> {
  const normalizedName = normalizeEntityName(name);

  // Try to find existing entity
  const { data: existing, error: findError } = await supabase
    .from("knowledge_entities")
    .select("id, frequency")
    .eq("name", normalizedName)
    .eq("type", type)
    .maybeSingle();

  if (findError && findError.code !== "PGRST116") {
    // PGRST116 is "not found", which is fine
    console.error("Error finding entity:", findError);
  }

  if (existing) {
    // Update frequency
    await supabase
      .from("knowledge_entities")
      .update({
        frequency: (existing.frequency || 1) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    return existing.id;
  }

  // Create new entity
  const { data: created, error: createError } = await supabase
    .from("knowledge_entities")
    .insert({
      name: normalizedName,
      type: type,
      description: description || null,
      frequency: 1,
    })
    .select("id")
    .single();

  if (createError || !created) {
    throw new Error(
      `Failed to create knowledge entity: ${createError?.message ?? "Unknown error"}`
    );
  }

  return created.id;
}

/**
 * Extract entities from an insight using Anthropic AI
 */
export async function extractEntitiesFromInsight(
  insight: Insight
): Promise<{
  entityIds: string[];
  keywords: Array<{ entityId: string; relevance: number }>;
}> {
  const supabase = getAdminSupabaseClient();

  try {
    // Call Anthropic agent for entity extraction
    const result = await executeAgent({
      supabase,
      agentSlug: "insight-entity-extraction",
      interactionType: "insight.entity.extraction",
      variables: {
        content: insight.content,
        summary: insight.summary || "",
        type: insight.type,
        category: insight.category || "",
      },
    });

    // Parse the response
    const extracted = parseEntityExtractionResponse(result.content);

    const entityIds: string[] = [];
    const keywords: Array<{ entityId: string; relevance: number }> = [];

    // Process keywords
    for (const keyword of extracted.keywords) {
      try {
        const entityId = await findOrCreateEntity(
          supabase,
          keyword.text,
          keyword.type || "keyword"
        );
        entityIds.push(entityId);
        keywords.push({
          entityId,
          relevance: keyword.relevance || 0.5,
        });
      } catch (error) {
        console.error(`Error processing keyword "${keyword.text}":`, error);
      }
    }

    // Process concepts
    for (const concept of extracted.concepts) {
      try {
        const entityId = await findOrCreateEntity(supabase, concept, "concept");
        if (!entityIds.includes(entityId)) {
          entityIds.push(entityId);
        }
      } catch (error) {
        console.error(`Error processing concept "${concept}":`, error);
      }
    }

    // Process themes
    for (const theme of extracted.themes) {
      try {
        const entityId = await findOrCreateEntity(supabase, theme, "theme");
        if (!entityIds.includes(entityId)) {
          entityIds.push(entityId);
        }
      } catch (error) {
        console.error(`Error processing theme "${theme}":`, error);
      }
    }

    return {
      entityIds,
      keywords,
    };
  } catch (error) {
    console.error("Error extracting entities from insight:", error);
    // Return empty result on error
    return {
      entityIds: [],
      keywords: [],
    };
  }
}

/**
 * Store insight-keyword relationships
 */
export async function storeInsightKeywords(
  supabase: SupabaseClient,
  insightId: string,
  keywords: Array<{ entityId: string; relevance: number }>
): Promise<void> {
  if (keywords.length === 0) {
    return;
  }

  // Delete existing keywords for this insight
  await supabase.from("insight_keywords").delete().eq("insight_id", insightId);

  // Insert new keywords
  const keywordRows = keywords.map((kw) => ({
    insight_id: insightId,
    entity_id: kw.entityId,
    relevance_score: kw.relevance,
    extraction_method: "ai",
  }));

  const { error } = await supabase.from("insight_keywords").insert(keywordRows);

  if (error) {
    console.error("Error storing insight keywords:", error);
    throw new Error(`Failed to store insight keywords: ${error.message}`);
  }
}

/**
 * Generate and store embeddings for knowledge entities
 */
export async function generateEntityEmbeddings(
  supabase: SupabaseClient,
  entityIds: string[]
): Promise<void> {
  if (entityIds.length === 0) {
    return;
  }

  // Fetch entities without embeddings
  const { data: entities, error: fetchError } = await supabase
    .from("knowledge_entities")
    .select("id, name, description, embedding")
    .in("id", entityIds)
    .is("embedding", null);

  if (fetchError) {
    console.error("Error fetching entities for embedding:", fetchError);
    return;
  }

  if (!entities || entities.length === 0) {
    return; // All entities already have embeddings
  }

  // Import generateEmbedding dynamically to avoid circular dependencies
  const { generateEmbedding } = await import("@/lib/ai/embeddings");

  // Generate embeddings for each entity
  for (const entity of entities) {
    try {
      const textToEmbed = entity.description || entity.name;
      const embedding = await generateEmbedding(textToEmbed);

      // Store embedding
      // Supabase automatically converts number arrays to PostgreSQL vector type
      const { error: updateError } = await supabase
        .from("knowledge_entities")
        .update({
          embedding: embedding, // Array is automatically converted to vector type
          updated_at: new Date().toISOString(),
        })
        .eq("id", entity.id);

      if (updateError) {
        console.error(
          `Error storing embedding for entity ${entity.id}:`,
          updateError
        );
      }
    } catch (error) {
      console.error(
        `Error generating embedding for entity ${entity.name}:`,
        error
      );
    }
  }
}

