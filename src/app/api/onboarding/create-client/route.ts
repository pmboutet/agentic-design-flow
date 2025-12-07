import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient, requireAuth } from "@/lib/supabaseServer";
import { sanitizeText } from "@/lib/sanitize";
import { parseErrorMessage } from "@/lib/utils";
import { type ApiResponse, type ClientRecord } from "@/types";

/**
 * API endpoint for participants to create their own client organization.
 * This allows new users to onboard themselves by creating a client
 * and becoming its client_admin.
 *
 * Unlike /api/admin/clients, this endpoint:
 * - Only requires authentication (not admin role)
 * - Automatically promotes the user to client_admin
 * - Associates the user with the new client
 */

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Le nom du client est requis").max(255),
});

function mapClient(row: any): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    email: row.email,
    company: row.company,
    industry: row.industry,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function POST(request: NextRequest) {
  try {
    // Only require authentication, not admin role
    const { user } = await requireAuth();
    const supabase = await createServerSupabaseClient();

    const body = await request.json();
    const payload = createClientSchema.parse(body);
    const clientName = sanitizeText(payload.name);

    // Check if client name already exists
    const { data: existingClient, error: checkError } = await supabase
      .from("clients")
      .select("id, name")
      .ilike("name", clientName)
      .maybeSingle();

    if (checkError) {
      console.error("[POST /api/onboarding/create-client] Error checking client name:", checkError);
      throw new Error(`Erreur lors de la vérification du nom: ${checkError.message}`);
    }

    if (existingClient) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: `Un client avec le nom "${clientName}" existe déjà. Veuillez choisir un autre nom.`
      }, { status: 409 });
    }

    // Get user's profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, client_id")
      .eq("auth_id", user.id)
      .single();

    if (profileError || !profile) {
      console.error("[POST /api/onboarding/create-client] Profile not found:", profileError);
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Profil utilisateur introuvable. Veuillez vous reconnecter."
      }, { status: 401 });
    }

    // Check if user already has admin privileges
    const currentRole = profile.role?.toLowerCase() ?? "";
    if (["full_admin", "client_admin"].includes(currentRole)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: "Vous êtes déjà administrateur. Utilisez le dashboard admin pour créer des clients."
      }, { status: 400 });
    }

    // Create the client
    const { data: newClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        name: clientName,
        status: "active"
      })
      .select()
      .single();

    if (clientError) {
      console.error("[POST /api/onboarding/create-client] Error creating client:", clientError);
      if (clientError.code === '23505' || clientError.message.includes('unique constraint')) {
        return NextResponse.json<ApiResponse>({
          success: false,
          error: `Un client avec le nom "${clientName}" existe déjà.`
        }, { status: 409 });
      }
      throw clientError;
    }

    // Promote user to client_admin and associate with the client
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        role: "client_admin",
        client_id: newClient.id
      })
      .eq("id", profile.id);

    if (updateError) {
      console.error("[POST /api/onboarding/create-client] Error updating profile:", updateError);
      // Rollback: delete the client we just created
      await supabase.from("clients").delete().eq("id", newClient.id);
      throw new Error(`Erreur lors de la mise à jour du profil: ${updateError.message}`);
    }

    console.log(`[POST /api/onboarding/create-client] User ${user.id} created client "${clientName}" and became client_admin`);

    return NextResponse.json<ApiResponse<ClientRecord>>({
      success: true,
      data: mapClient(newClient)
    }, { status: 201 });

  } catch (error) {
    let status = 500;
    if (error instanceof z.ZodError) {
      status = 400;
      return NextResponse.json<ApiResponse>({
        success: false,
        error: error.errors[0]?.message || "Données invalides"
      }, { status });
    }
    if (error instanceof Error && error.message.includes('required')) {
      status = 401;
    }

    return NextResponse.json<ApiResponse>({
      success: false,
      error: parseErrorMessage(error)
    }, { status });
  }
}
