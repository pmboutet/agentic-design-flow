import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { generateStepSummary } from '@/lib/ai/conversation-plan';
import type { ApiResponse } from '@/types';

/**
 * Endpoint to generate step summary asynchronously
 * Called in background after step completion
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;
    const body = await request.json();
    const { stepId, askSessionId } = body;

    if (!stepId || !askSessionId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'stepId and askSessionId are required'
      }, { status: 400 });
    }

    console.log('📝 [STEP-SUMMARY] Generating summary for step:', stepId, 'askSessionId:', askSessionId);

    const adminSupabase = getAdminSupabaseClient();
    
    const generatedSummary = await generateStepSummary(
      adminSupabase,
      stepId,
      askSessionId
    );

    if (generatedSummary) {
      console.log('📝 [STEP-SUMMARY] Summary generated, updating step:', stepId);
      // Update the step with the generated summary
      const { error: updateError } = await adminSupabase
        .from('ask_conversation_plan_steps')
        .update({ summary: generatedSummary })
        .eq('id', stepId);
      
      if (updateError) {
        console.error('❌ [STEP-SUMMARY] Failed to update step summary:', updateError);
        return NextResponse.json<ApiResponse>({
          success: false,
          error: 'Failed to update step summary'
        }, { status: 500 });
      } else {
        console.log('✅ [STEP-SUMMARY] Step summary updated successfully:', generatedSummary.substring(0, 100) + '...');
        return NextResponse.json<ApiResponse>({
          success: true,
          data: { summary: generatedSummary }
        });
      }
    } else {
      console.warn('⚠️ [STEP-SUMMARY] No summary generated for step:', stepId);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'No summary generated'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('❌ [STEP-SUMMARY] Failed to generate step summary:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}



