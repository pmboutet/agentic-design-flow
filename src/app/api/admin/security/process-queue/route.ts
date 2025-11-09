import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAdminSupabaseClient } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/supabaseServer';
import { detectMaliciousContent, shouldQuarantine, getMaxSeverity } from '@/lib/security/detection';
import { quarantineProfile } from '@/lib/security/quarantine';
import { createAgentLog } from '@/lib/ai/logs';
import { executeAgent } from '@/lib/ai/service';
import { parseErrorMessage } from '@/lib/utils';
import type { ApiResponse } from '@/types';

interface QueueItem {
  id: string;
  message_id: string;
  status: string;
  attempts: number;
}

interface MessageRow {
  id: string;
  content: string;
  user_id: string | null;
  sender_type: string;
}

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

/**
 * Process security monitoring queue
 * This endpoint should be called periodically (e.g., via cron) to process pending security checks
 */
export async function POST(request: NextRequest) {
  try {
    // Require admin access
    await requireAdmin();

    const adminClient = getAdminSupabaseClient();
    const body = await request.json().catch(() => ({}));
    const batchSize = body.batchSize ?? BATCH_SIZE;

    // Get pending queue items
    const { data: queueItems, error: queueError } = await adminClient
      .from('security_monitoring_queue')
      .select('id, message_id, status, attempts')
      .in('status', ['pending', 'failed'])
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (queueError) {
      throw new Error(`Failed to fetch queue items: ${queueError.message}`);
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json<ApiResponse<{ processed: number; quarantined: number }>>({
        success: true,
        data: {
          processed: 0,
          quarantined: 0,
        },
        message: 'No items to process',
      });
    }

    let processed = 0;
    let quarantined = 0;
    const errors: string[] = [];

    // Process each queue item
    for (const item of queueItems) {
      try {
        await processQueueItem(adminClient, item);
        processed++;
      } catch (error) {
        const errorMessage = parseErrorMessage(error);
        errors.push(`Queue item ${item.id}: ${errorMessage}`);
        
        // Mark as failed
        await adminClient
          .from('security_monitoring_queue')
          .update({
            status: 'failed',
            last_error: errorMessage,
            attempts: item.attempts + 1,
            finished_at: new Date().toISOString(),
          })
          .eq('id', item.id);
      }
    }

    // Count quarantined profiles from this batch
    const { data: recentDetections } = await adminClient
      .from('security_detections')
      .select('id')
      .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last minute
      .in('severity', ['high', 'critical']);

    quarantined = recentDetections?.length ?? 0;

    return NextResponse.json<ApiResponse<{ processed: number; quarantined: number; errors?: string[] }>>({
      success: true,
      data: {
        processed,
        quarantined,
        ...(errors.length > 0 && { errors }),
      },
      message: `Processed ${processed} items${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    console.error('Error processing security queue:', error);
    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error),
    }, { status: 500 });
  }
}

/**
 * Process a single queue item
 */
async function processQueueItem(
  adminClient: SupabaseClient,
  item: QueueItem
): Promise<void> {
  // Mark as processing
  await adminClient
    .from('security_monitoring_queue')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
      attempts: item.attempts + 1,
    })
    .eq('id', item.id);

  // Get the message
  const { data: message, error: messageError } = await adminClient
    .from('messages')
    .select('id, content, user_id, sender_type')
    .eq('id', item.message_id)
    .single();

  if (messageError || !message) {
    throw new Error(`Message not found: ${item.message_id}`);
  }

  // Only process user messages
  if (message.sender_type !== 'user') {
    await adminClient
      .from('security_monitoring_queue')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    return;
  }

  // Step 1: Detect malicious content using non-agentic detection (patterns, regex)
  const detectionResult = detectMaliciousContent(message.content);

  // Step 2: Also run AI agent analysis for deeper content analysis
  let aiAnalysisResult: {
    hasThreat: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    threatType: string | null;
    explanation: string;
    recommendedAction: 'none' | 'warn' | 'quarantine';
    confidence: number;
  } | null = null;

  try {
    // Get message with ask_session_id
    const { data: messageWithSession } = await adminClient
      .from('messages')
      .select('ask_session_id')
      .eq('id', message.id)
      .single();

    const askSessionId = messageWithSession?.ask_session_id;

    // Get ASK session info for context
    let askKey = '';
    if (askSessionId) {
      const { data: askSession } = await adminClient
        .from('ask_sessions')
        .select('ask_key')
        .eq('id', askSessionId)
        .maybeSingle();
      askKey = askSession?.ask_key ?? '';
    }

    // Get recent messages for context
    const { data: recentMessages } = askSessionId ? await adminClient
      .from('messages')
      .select('content, sender_type, created_at')
      .eq('ask_session_id', askSessionId)
      .order('created_at', { ascending: false })
      .limit(5) : { data: [] };

    // Get participant name
    const { data: profile } = message.user_id ? await adminClient
      .from('profiles')
      .select('full_name, email')
      .eq('id', message.user_id)
      .maybeSingle() : { data: null };

    // Execute AI agent for security monitoring
    const aiResult = await executeAgent({
      supabase: adminClient,
      agentSlug: 'security-message-monitoring',
      messageId: message.id,
      interactionType: 'security.message-analysis',
      variables: {
        message_content: message.content,
        ask_key: askKey,
        participant_name: profile?.full_name ?? profile?.email ?? 'Unknown',
        recent_messages: JSON.stringify((recentMessages?.slice(0, 3) ?? []).map(m => ({
          content: m.content,
          sender_type: m.sender_type,
        }))),
        message_id: message.id,
      },
    });

    // Parse AI response (should be JSON)
    try {
      const parsed = JSON.parse(aiResult.content);
      aiAnalysisResult = {
        hasThreat: parsed.hasThreat ?? false,
        severity: parsed.severity ?? 'low',
        threatType: parsed.threatType ?? null,
        explanation: parsed.explanation ?? '',
        recommendedAction: parsed.recommendedAction ?? 'none',
        confidence: parsed.confidence ?? 0,
      };
    } catch (parseError) {
      console.warn('Failed to parse AI analysis result:', parseError);
      // If AI analysis fails, continue with non-agentic detection only
    }
  } catch (aiError) {
    // If AI agent fails, continue with non-agentic detection only
    console.warn('AI security monitoring agent failed:', aiError);
  }

  // Combine results: use AI analysis if available, otherwise use non-agentic detection
  const finalHasThreats = detectionResult.hasThreats || (aiAnalysisResult?.hasThreat ?? false);
  
  if (!finalHasThreats) {
    // No threats detected, mark as completed
    await adminClient
      .from('security_monitoring_queue')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    return;
  }

  // Threats detected - create security detections
  // Combine non-agentic and AI detections
  const allDetections = [...detectionResult.detections];
  
  // Add AI analysis result if available
  if (aiAnalysisResult && aiAnalysisResult.hasThreat) {
    allDetections.push({
      type: (aiAnalysisResult.threatType as any) ?? 'suspicious',
      severity: aiAnalysisResult.severity,
      pattern: aiAnalysisResult.explanation,
      details: {
        source: 'ai_agent',
        confidence: aiAnalysisResult.confidence,
        recommendedAction: aiAnalysisResult.recommendedAction,
      },
    });
  }

  const maxSeverity = getMaxSeverity(allDetections);
  
  // Create detection records for each threat
  const detectionInserts = allDetections.map((detection) => ({
    message_id: message.id,
    profile_id: message.user_id,
    detection_type: detection.type,
    severity: detection.severity,
    matched_patterns: {
      pattern: detection.pattern,
      details: detection.details,
    },
    status: 'pending',
  }));

  const { error: detectionError } = await adminClient
    .from('security_detections')
    .insert(detectionInserts);

  if (detectionError) {
    throw new Error(`Failed to create security detections: ${detectionError.message}`);
  }

  // Check if profile should be quarantined
  if (message.user_id && shouldQuarantine(maxSeverity)) {
    try {
      const reason = `Automatic quarantine due to ${maxSeverity} severity security threat detected in message ${message.id}`;
      await quarantineProfile(adminClient, message.user_id, reason);
      
      // Create agent log for security alert
      try {
        await createAgentLog(adminClient, {
          interactionType: 'security.alert',
          requestPayload: {
            messageId: message.id,
            profileId: message.user_id,
            severity: maxSeverity,
            detections: allDetections,
            aiAnalysis: aiAnalysisResult,
            action: 'profile_quarantined',
          },
        });
      } catch (logError) {
        // Log error but don't fail the process
        console.error('Failed to create security alert log:', logError);
      }
    } catch (quarantineError) {
      console.error('Failed to quarantine profile:', quarantineError);
      // Continue processing even if quarantine fails
    }
  } else if (maxSeverity) {
    // Create agent log for non-critical detection
    try {
      await createAgentLog(adminClient, {
        interactionType: 'security.alert',
          requestPayload: {
            messageId: message.id,
            profileId: message.user_id,
            severity: maxSeverity,
            detections: allDetections,
            aiAnalysis: aiAnalysisResult,
            action: 'detection_created',
          },
      });
    } catch (logError) {
      // Log error but don't fail the process
      console.error('Failed to create security alert log:', logError);
    }
  }

  // Mark queue item as completed
  await adminClient
    .from('security_monitoring_queue')
    .update({
      status: 'completed',
      finished_at: new Date().toISOString(),
    })
    .eq('id', item.id);
}

