import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { parseErrorMessage } from "@/lib/utils";
import { createChallengeFoundationInsights } from "@/lib/foundationInsights";
import type { AiChallengeUpdateSuggestion, ApiResponse } from "@/types";

const applySuggestionSchema = z.object({
  challengeId: z.string().uuid(),
  updates: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    impact: z.string().optional(),
    owners: z.array(z.object({
      id: z.string().optional().nullable(),
      name: z.string(),
      role: z.string().optional().nullable(),
    })).optional(),
  }).optional(),
  foundationInsights: z.array(z.object({
    insightId: z.string(),
    title: z.string().optional(), // Optional: will be fetched from DB if not provided
    reason: z.string(),
    priority: z.enum(["low", "medium", "high", "critical"]),
  })).optional(),
  subChallengeUpdates: z.array(z.object({
    id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    status: z.string().optional(),
    impact: z.string().optional(),
    summary: z.string().optional(),
  })).optional(),
  newSubChallenges: z.array(z.object({
    referenceId: z.string().optional(),
    parentId: z.string().optional().nullable(),
    title: z.string(),
    description: z.string().optional(),
    status: z.string().optional(),
    impact: z.string().optional(),
    owners: z.array(z.object({
      id: z.string().optional().nullable(),
      name: z.string(),
      role: z.string().optional().nullable(),
    })).optional(),
    summary: z.string().optional(),
  })).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = z.string().uuid().parse(params.id);
    const body = await request.json();
    
    console.log('🔍 Apply API - Received body:', JSON.stringify(body, null, 2));
    
    const suggestion = applySuggestionSchema.parse(body);
    
    console.log('✅ Apply API - Zod validation passed');
    
    const supabase = getAdminSupabaseClient();

    // Start a transaction-like operation
    const results = [];

    // 1. Update the main challenge if there are updates
    if (suggestion.updates) {
      const updateData: any = {};
      
      if (suggestion.updates.title) updateData.title = suggestion.updates.title;
      if (suggestion.updates.description) updateData.description = suggestion.updates.description;
      if (suggestion.updates.status) updateData.status = suggestion.updates.status;
      if (suggestion.updates.impact) updateData.impact = suggestion.updates.impact;

      const { data: challengeUpdate, error: challengeError } = await supabase
        .from('challenges')
        .update(updateData)
        .eq('id', suggestion.challengeId)
        .select()
        .single();

      if (challengeError) {
        throw new Error(`Failed to update challenge: ${challengeError.message}`);
      }

      results.push({ type: 'challenge_update', data: challengeUpdate });
    }

    // 2. Create foundation insights links
    if (suggestion.foundationInsights?.length) {
      console.log('🔍 Apply API - Creating foundation insights:', {
        challengeId: suggestion.challengeId,
        count: suggestion.foundationInsights.length,
        insights: suggestion.foundationInsights,
      });
      
      try {
        const foundationInsights = await createChallengeFoundationInsights(
          suggestion.challengeId,
          suggestion.foundationInsights
        );
        console.log('✅ Apply API - Foundation insights created successfully:', foundationInsights.length);
        results.push({ type: 'foundation_insights', data: foundationInsights });
      } catch (insightError) {
        console.error('❌ Apply API - Error creating foundation insights:', insightError);
        throw insightError;
      }
    }

    // 3. Update sub-challenges
    if (suggestion.subChallengeUpdates?.length) {
      for (const subUpdate of suggestion.subChallengeUpdates) {
        const updateData: any = {};
        
        if (subUpdate.title) updateData.title = subUpdate.title;
        if (subUpdate.description) updateData.description = subUpdate.description;
        if (subUpdate.status) updateData.status = subUpdate.status;
        if (subUpdate.impact) updateData.impact = subUpdate.impact;

        const { data: subChallengeUpdate, error: subError } = await supabase
          .from('challenges')
          .update(updateData)
          .eq('id', subUpdate.id)
          .select()
          .single();

        if (subError) {
          console.error(`Failed to update sub-challenge ${subUpdate.id}:`, subError);
        } else {
          results.push({ type: 'sub_challenge_update', data: subChallengeUpdate });
        }
      }
    }

    // 4. Create new sub-challenges
    if (suggestion.newSubChallenges?.length) {
      for (const newSub of suggestion.newSubChallenges) {
        const insertData: any = {
          project_id: projectId,
          title: newSub.title,
          parent_id: newSub.parentId || suggestion.challengeId,
        };

        if (newSub.description) insertData.description = newSub.description;
        if (newSub.status) insertData.status = newSub.status;
        if (newSub.impact) insertData.impact = newSub.impact;

        const { data: newSubChallenge, error: newSubError } = await supabase
          .from('challenges')
          .insert(insertData)
          .select()
          .single();

        if (newSubError) {
          console.error(`Failed to create new sub-challenge:`, newSubError);
        } else {
          results.push({ type: 'new_sub_challenge', data: newSubChallenge });
        }
      }
    }

    return NextResponse.json<ApiResponse<{ results: any[] }>>({
      success: true,
      data: { results },
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
