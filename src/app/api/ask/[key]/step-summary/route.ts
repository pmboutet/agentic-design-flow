import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { generateStepSummary } from '@/lib/ai/conversation-plan';
import type { ApiResponse } from '@/types';

/**
 * Custom error class for step summary failures
 * This is thrown when the ask-conversation-step-summarizer agent fails
 */
export class StepSummaryError extends Error {
  constructor(
    message: string,
    public readonly stepId: string,
    public readonly askSessionId: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'StepSummaryError';
  }
}

/**
 * Endpoint to generate step summary asynchronously
 * Called in background after step completion
 *
 * IMPORTANT: This endpoint throws StepSummaryError if summarization fails.
 * Errors are logged and stored in the step's summary_error field.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const adminSupabase = getAdminSupabaseClient();
  let stepId: string | undefined;
  let askSessionId: string | undefined;

  try {
    const { key } = await params;
    const body = await request.json();
    stepId = body.stepId;
    askSessionId = body.askSessionId;

    if (!stepId || !askSessionId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'stepId and askSessionId are required'
      }, { status: 400 });
    }

    console.log('📝 [STEP-SUMMARY] Generating summary for step:', stepId, 'askSessionId:', askSessionId);

    const generatedSummary = await generateStepSummary(
      adminSupabase,
      stepId,
      askSessionId
    );

    if (generatedSummary) {
      console.log('📝 [STEP-SUMMARY] Summary generated, updating step:', stepId);
      // Update the step with the generated summary and clear any previous error
      const { error: updateError } = await adminSupabase
        .from('ask_conversation_plan_steps')
        .update({
          summary: generatedSummary,
          summary_error: null // Clear any previous error
        })
        .eq('id', stepId);

      if (updateError) {
        console.error('❌ [STEP-SUMMARY] Failed to update step summary:', updateError);
        throw new StepSummaryError(
          `Failed to update step summary in database: ${updateError.message}`,
          stepId,
          askSessionId
        );
      }

      console.log('✅ [STEP-SUMMARY] Step summary updated successfully:', generatedSummary.substring(0, 100) + '...');
      return NextResponse.json<ApiResponse>({
        success: true,
        data: { summary: generatedSummary }
      });
    } else {
      throw new StepSummaryError(
        'Summarizer returned null - no summary generated',
        stepId,
        askSessionId
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [STEP-SUMMARY] CRITICAL: Failed to generate step summary:', {
      stepId,
      askSessionId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Store the error in the database for visibility
    if (stepId) {
      try {
        await adminSupabase
          .from('ask_conversation_plan_steps')
          .update({
            summary_error: errorMessage,
            summary: `[ERREUR] La génération du résumé a échoué: ${errorMessage}`
          })
          .eq('id', stepId);
        console.log('📝 [STEP-SUMMARY] Error stored in step record:', stepId);
      } catch (dbError) {
        console.error('❌ [STEP-SUMMARY] Failed to store error in database:', dbError);
      }
    }

    // Create and throw a proper StepSummaryError
    const summaryError = error instanceof StepSummaryError
      ? error
      : new StepSummaryError(
          errorMessage,
          stepId ?? 'unknown',
          askSessionId ?? 'unknown',
          error instanceof Error ? error : undefined
        );

    return NextResponse.json<ApiResponse>({
      success: false,
      error: summaryError.message
    }, { status: 500 });
  }
}




