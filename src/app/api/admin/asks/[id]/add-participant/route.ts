import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabaseClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/supabaseServer";
import { canManageAskParticipants } from "@/lib/memberPermissions";
import { sanitizeOptional, sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { ensureClientMembership, ensureProjectMembership } from "@/app/api/admin/profiles/helpers";
import type { ApiResponse } from "@/types";
import { randomBytes } from "crypto";

const addExistingUserSchema = z.object({
  userId: z.string().uuid(),
  createUser: z.undefined(),
});

const createUserSchema = z.object({
  userId: z.undefined(),
  createUser: z.object({
    email: z.string().trim().email().max(255),
    firstName: z.string().trim().max(100).optional().or(z.literal("")),
    lastName: z.string().trim().max(100).optional().or(z.literal("")),
    jobTitle: z.string().trim().max(255).optional().or(z.literal("")),
  }),
});

const payloadSchema = z.union([addExistingUserSchema, createUserSchema]);

interface AddParticipantResult {
  participantId: string;
  userId: string;
  userCreated: boolean;
  addedToClient: boolean;
  addedToProject: boolean;
}

/**
 * POST /api/admin/asks/[id]/add-participant
 *
 * Adds a participant to an ASK session with cascade logic:
 * 1. Creates user if needed (createUser mode)
 * 2. Adds user to client_members if not already member
 * 3. Adds user to project_members if not already member
 * 4. Adds user to ask_participants
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth check
    const { profile } = await requireAdmin();

    const resolvedParams = await params;
    const askId = z.string().uuid("Invalid ASK id").parse(resolvedParams.id);

    // 2. Permission check
    const permission = await canManageAskParticipants(profile, askId);
    if (!permission.allowed) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: permission.error || "Permission denied",
      }, { status: 403 });
    }

    // 3. Parse payload
    const body = await request.json();
    const payload = payloadSchema.parse(body);

    const supabase = getAdminSupabaseClient();

    // 4. Get ASK session with project info
    const { data: askSession, error: askError } = await supabase
      .from("ask_sessions")
      .select("id, project_id, projects(client_id)")
      .eq("id", askId)
      .single();

    if (askError || !askSession) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "ASK session not found",
      }, { status: 404 });
    }

    const projectId = askSession.project_id;
    // Handle projects being either an object or array depending on Supabase query
    const projectsData = askSession.projects;
    const projectRecord = Array.isArray(projectsData) ? projectsData[0] : projectsData;
    const clientId = (projectRecord as { client_id: string | null } | null)?.client_id;

    if (!clientId) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Project has no associated client",
      }, { status: 400 });
    }

    // 5. Get or create user
    let userId: string;
    let userCreated = false;

    if (payload.userId) {
      // Existing user mode
      userId = payload.userId;

      // Verify user exists
      const { data: existingUser, error: userError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (userError || !existingUser) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: "User not found",
        }, { status: 404 });
      }
    } else if (payload.createUser) {
      // Create new user mode
      const { email, firstName, lastName, jobTitle } = payload.createUser;

      // Check if email already exists
      const { data: existingByEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (existingByEmail) {
        // User already exists with this email, use them instead
        userId = existingByEmail.id;
      } else {
        // Create new profile
        const insertData: Record<string, unknown> = {
          email: sanitizeText(email.toLowerCase()),
          role: "participant",
          is_active: true,
        };

        if (firstName) {
          insertData.first_name = sanitizeOptional(firstName);
        }
        if (lastName) {
          insertData.last_name = sanitizeOptional(lastName);
        }
        if (firstName || lastName) {
          const fullName = [firstName, lastName].filter(Boolean).join(" ");
          if (fullName) {
            insertData.full_name = sanitizeOptional(fullName);
          }
        }
        if (jobTitle) {
          insertData.job_title = sanitizeOptional(jobTitle);
        }

        const { data: newProfile, error: createError } = await supabase
          .from("profiles")
          .insert(insertData)
          .select("id")
          .single();

        if (createError) {
          throw createError;
        }

        userId = newProfile.id;
        userCreated = true;
      }
    } else {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Either userId or createUser must be provided",
      }, { status: 400 });
    }

    // 6. Check if user is already a participant of this ASK
    const { data: existingParticipant } = await supabase
      .from("ask_participants")
      .select("id")
      .eq("ask_session_id", askId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingParticipant) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "User is already a participant of this ASK",
      }, { status: 409 });
    }

    // 7. Ensure user is a client member (uses shared helper)
    const addedToClient = await ensureClientMembership(supabase, clientId, userId);

    // 8. Ensure user is a project member (uses shared helper)
    const addedToProject = await ensureProjectMembership(supabase, projectId, userId);

    // 9. Insert ask_participants with generated invite_token
    const inviteToken = randomBytes(16).toString("hex");

    const { data: participant, error: participantError } = await supabase
      .from("ask_participants")
      .insert({
        ask_session_id: askId,
        user_id: userId,
        role: "participant",
        invite_token: inviteToken,
      })
      .select("id")
      .single();

    if (participantError) {
      throw participantError;
    }

    const result: AddParticipantResult = {
      participantId: participant.id,
      userId,
      userCreated,
      addedToClient,
      addedToProject,
    };

    return NextResponse.json<ApiResponse<AddParticipantResult>>({
      success: true,
      data: result,
    }, { status: 201 });
  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
    } else if (error instanceof Error && error.message.includes("required")) {
      status = 403;
    }
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof z.ZodError
        ? error.errors[0]?.message || "Invalid payload"
        : parseErrorMessage(error),
    }, { status });
  }
}
