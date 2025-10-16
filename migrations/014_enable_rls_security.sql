-- Migration 014: Enable Row Level Security (RLS)
-- This migration sets up comprehensive RLS policies for the application
-- 
-- Permission Levels:
-- 1. Full Admin: Access to all data
-- 2. Moderator/Facilitator: Access to clients and projects they're associated with + related data
-- 3. Regular Users: Access to messages and insights they're associated with

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to check if user is a full admin
CREATE OR REPLACE FUNCTION public.is_full_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE auth_id = auth.uid() 
    AND role IN ('admin', 'full_admin')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is moderator or facilitator
CREATE OR REPLACE FUNCTION public.is_moderator_or_facilitator()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE auth_id = auth.uid() 
    AND role IN ('moderator', 'facilitator')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current user's profile ID
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id 
    FROM public.profiles 
    WHERE auth_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to a project
CREATE OR REPLACE FUNCTION public.has_project_access(project_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.project_members 
    WHERE project_id = project_uuid 
    AND user_id = public.current_user_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to a client
CREATE OR REPLACE FUNCTION public.has_client_access(client_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is member of any project belonging to this client
  RETURN EXISTS (
    SELECT 1 
    FROM public.projects p
    INNER JOIN public.project_members pm ON pm.project_id = p.id
    WHERE p.client_id = client_uuid 
    AND pm.user_id = public.current_user_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user is participant in an ask session
CREATE OR REPLACE FUNCTION public.is_ask_participant(ask_session_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.ask_participants 
    WHERE ask_session_id = ask_session_uuid 
    AND user_id = public.current_user_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DROP EXISTING POLICIES FROM MIGRATION 011
-- ============================================================================

-- Drop old policies from migration 011
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view same client profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own client" ON public.clients;
DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Admins can manage clients" ON public.clients;

DROP POLICY IF EXISTS "Users can view own memberships" ON public.project_members;
DROP POLICY IF EXISTS "Project members can view team" ON public.project_members;
DROP POLICY IF EXISTS "Admins can manage project members" ON public.project_members;

DROP POLICY IF EXISTS "Members can view their projects" ON public.projects;
DROP POLICY IF EXISTS "Users can view client projects" ON public.projects;
DROP POLICY IF EXISTS "Admins can manage projects" ON public.projects;

DROP POLICY IF EXISTS "Members can view project challenges" ON public.challenges;
DROP POLICY IF EXISTS "Facilitators can manage challenges" ON public.challenges;

DROP POLICY IF EXISTS "Participants can view their sessions" ON public.ask_sessions;
DROP POLICY IF EXISTS "Members can view project sessions" ON public.ask_sessions;
DROP POLICY IF EXISTS "Facilitators can manage sessions" ON public.ask_sessions;

DROP POLICY IF EXISTS "Users can view session participants" ON public.ask_participants;
DROP POLICY IF EXISTS "Facilitators can manage participants" ON public.ask_participants;

DROP POLICY IF EXISTS "Participants can view session messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users send as themselves" ON public.messages;

DROP POLICY IF EXISTS "Users can view session insights" ON public.insights;
DROP POLICY IF EXISTS "Facilitators can manage insights" ON public.insights;

DROP POLICY IF EXISTS "Users can view challenge insights" ON public.challenge_insights;
DROP POLICY IF EXISTS "Facilitators can manage challenge insights" ON public.challenge_insights;

DROP POLICY IF EXISTS "Users can view kpi estimations" ON public.kpi_estimations;
DROP POLICY IF EXISTS "Facilitators can manage kpi estimations" ON public.kpi_estimations;

-- ============================================================================
-- ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_foundation_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_estimations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_insight_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES TABLE POLICIES
-- ============================================================================

-- Full admins can see all profiles
CREATE POLICY "Full admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_full_admin());

-- Moderators/Facilitators can see profiles in their projects
CREATE POLICY "Moderators can view project member profiles"
  ON public.profiles FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.project_members pm1
      INNER JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
      WHERE pm1.user_id = public.current_user_id()
      AND pm2.user_id = profiles.id
    )
  );

-- Users can see their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth_id = auth.uid());

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Full admins can insert/update/delete any profile
CREATE POLICY "Full admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

-- ============================================================================
-- CLIENTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all clients"
  ON public.clients FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view their clients"
  ON public.clients FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_client_access(id)
  );

-- ============================================================================
-- PROJECTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all projects"
  ON public.projects FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view their projects"
  ON public.projects FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(id)
  );

CREATE POLICY "Moderators can update their projects"
  ON public.projects FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(id)
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(id)
  );

-- ============================================================================
-- PROJECT_MEMBERS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all project members"
  ON public.project_members FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view project members"
  ON public.project_members FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can manage project members"
  ON public.project_members FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can update project members"
  ON public.project_members FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can delete project members"
  ON public.project_members FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Users can view their own project memberships"
  ON public.project_members FOR SELECT
  USING (user_id = public.current_user_id());

-- ============================================================================
-- CHALLENGES TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all challenges"
  ON public.challenges FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view project challenges"
  ON public.challenges FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can manage project challenges"
  ON public.challenges FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can update project challenges"
  ON public.challenges FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can delete project challenges"
  ON public.challenges FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

-- Users can view challenges they're assigned to
CREATE POLICY "Users can view assigned challenges"
  ON public.challenges FOR SELECT
  USING (assigned_to = public.current_user_id());

-- ============================================================================
-- ASK_SESSIONS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all ask sessions"
  ON public.ask_sessions FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view project ask sessions"
  ON public.ask_sessions FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can manage project ask sessions"
  ON public.ask_sessions FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can update project ask sessions"
  ON public.ask_sessions FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

CREATE POLICY "Moderators can delete project ask sessions"
  ON public.ask_sessions FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND public.has_project_access(project_id)
  );

-- Users can view ask sessions they participate in
CREATE POLICY "Users can view participating ask sessions"
  ON public.ask_sessions FOR SELECT
  USING (public.is_ask_participant(id));

-- ============================================================================
-- ASK_PARTICIPANTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all ask participants"
  ON public.ask_participants FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view ask participants"
  ON public.ask_participants FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ask_participants.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can manage ask participants"
  ON public.ask_participants FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ask_participants.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can update ask participants"
  ON public.ask_participants FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ask_participants.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ask_participants.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can delete ask participants"
  ON public.ask_participants FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ask_participants.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

-- Users can view participants in sessions they're part of
CREATE POLICY "Users can view participants in their sessions"
  ON public.ask_participants FOR SELECT
  USING (public.is_ask_participant(ask_session_id));

-- Users can view their own participation
CREATE POLICY "Users can view own participation"
  ON public.ask_participants FOR SELECT
  USING (user_id = public.current_user_id());

-- ============================================================================
-- MESSAGES TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all messages"
  ON public.messages FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view project messages"
  ON public.messages FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = messages.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can delete project messages"
  ON public.messages FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = messages.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

-- Users can view messages in sessions they participate in
CREATE POLICY "Users can view messages in their sessions"
  ON public.messages FOR SELECT
  USING (public.is_ask_participant(ask_session_id));

-- Users can create messages in sessions they participate in
CREATE POLICY "Users can create messages in their sessions"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_ask_participant(ask_session_id));

-- Users can update their own messages
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE
  USING (user_id = public.current_user_id())
  WITH CHECK (user_id = public.current_user_id());

-- Users can delete their own messages
CREATE POLICY "Users can delete own messages"
  ON public.messages FOR DELETE
  USING (user_id = public.current_user_id());

-- ============================================================================
-- INSIGHTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all insights"
  ON public.insights FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view project insights"
  ON public.insights FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = insights.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can manage project insights"
  ON public.insights FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = insights.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can update project insights"
  ON public.insights FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = insights.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = insights.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can delete project insights"
  ON public.insights FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = insights.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

-- Users can view insights in sessions they participate in
CREATE POLICY "Users can view insights in their sessions"
  ON public.insights FOR SELECT
  USING (public.is_ask_participant(ask_session_id));

-- Users can view insights they authored
CREATE POLICY "Users can view their authored insights"
  ON public.insights FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.insight_authors ia
      WHERE ia.insight_id = insights.id
      AND ia.user_id = public.current_user_id()
    )
  );

-- Users can create insights in sessions they participate in
CREATE POLICY "Users can create insights in their sessions"
  ON public.insights FOR INSERT
  WITH CHECK (public.is_ask_participant(ask_session_id));

-- ============================================================================
-- INSIGHT_AUTHORS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all insight authors"
  ON public.insight_authors FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view insight authors"
  ON public.insight_authors FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = insight_authors.insight_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can manage insight authors"
  ON public.insight_authors FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = insight_authors.insight_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Users can view insight authors in their sessions"
  ON public.insight_authors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.insights i
      WHERE i.id = insight_authors.insight_id
      AND public.is_ask_participant(i.ask_session_id)
    )
  );

-- ============================================================================
-- INSIGHT_TYPES TABLE POLICIES
-- ============================================================================

-- Everyone can view insight types (read-only reference data)
CREATE POLICY "Everyone can view insight types"
  ON public.insight_types FOR SELECT
  USING (true);

-- Only admins can manage insight types
CREATE POLICY "Full admins can manage insight types"
  ON public.insight_types FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

-- ============================================================================
-- CHALLENGE_INSIGHTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all challenge insights"
  ON public.challenge_insights FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view challenge insights"
  ON public.challenge_insights FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

CREATE POLICY "Moderators can manage challenge insights"
  ON public.challenge_insights FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

CREATE POLICY "Moderators can delete challenge insights"
  ON public.challenge_insights FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

-- ============================================================================
-- CHALLENGE_FOUNDATION_INSIGHTS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all foundation insights"
  ON public.challenge_foundation_insights FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view foundation insights"
  ON public.challenge_foundation_insights FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_foundation_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

CREATE POLICY "Moderators can manage foundation insights"
  ON public.challenge_foundation_insights FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_foundation_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

CREATE POLICY "Moderators can update foundation insights"
  ON public.challenge_foundation_insights FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_foundation_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_foundation_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

CREATE POLICY "Moderators can delete foundation insights"
  ON public.challenge_foundation_insights FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_foundation_insights.challenge_id
      AND public.has_project_access(c.project_id)
    )
  );

-- ============================================================================
-- KPI_ESTIMATIONS TABLE POLICIES
-- ============================================================================

CREATE POLICY "Full admins can manage all kpi estimations"
  ON public.kpi_estimations FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view kpi estimations"
  ON public.kpi_estimations FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = kpi_estimations.insight_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can manage kpi estimations"
  ON public.kpi_estimations FOR INSERT
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = kpi_estimations.insight_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can update kpi estimations"
  ON public.kpi_estimations FOR UPDATE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = kpi_estimations.insight_id
      AND public.has_project_access(a.project_id)
    )
  )
  WITH CHECK (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = kpi_estimations.insight_id
      AND public.has_project_access(a.project_id)
    )
  );

CREATE POLICY "Moderators can delete kpi estimations"
  ON public.kpi_estimations FOR DELETE
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.insights i
      INNER JOIN public.ask_sessions a ON a.id = i.ask_session_id
      WHERE i.id = kpi_estimations.insight_id
      AND public.has_project_access(a.project_id)
    )
  );

-- Users can view kpi estimations for insights they can see
CREATE POLICY "Users can view kpi estimations in their sessions"
  ON public.kpi_estimations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.insights i
      WHERE i.id = kpi_estimations.insight_id
      AND public.is_ask_participant(i.ask_session_id)
    )
  );

-- ============================================================================
-- AI CONFIGURATION TABLES POLICIES
-- ============================================================================

-- AI Model Configs: Read-only for moderators, full control for admins
CREATE POLICY "Full admins can manage ai model configs"
  ON public.ai_model_configs FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view ai model configs"
  ON public.ai_model_configs FOR SELECT
  USING (public.is_moderator_or_facilitator());

-- AI Agents: Read-only for moderators, full control for admins
CREATE POLICY "Full admins can manage ai agents"
  ON public.ai_agents FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view ai agents"
  ON public.ai_agents FOR SELECT
  USING (public.is_moderator_or_facilitator());

-- AI Agent Logs: Admins and moderators for their projects
CREATE POLICY "Full admins can view all ai agent logs"
  ON public.ai_agent_logs FOR SELECT
  USING (public.is_full_admin());

CREATE POLICY "Moderators can view project ai agent logs"
  ON public.ai_agent_logs FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ai_agent_logs.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

-- AI Insight Jobs: Similar to logs
CREATE POLICY "Full admins can manage ai insight jobs"
  ON public.ai_insight_jobs FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

CREATE POLICY "Moderators can view project ai insight jobs"
  ON public.ai_insight_jobs FOR SELECT
  USING (
    public.is_moderator_or_facilitator() 
    AND EXISTS (
      SELECT 1 FROM public.ask_sessions a
      WHERE a.id = ai_insight_jobs.ask_session_id
      AND public.has_project_access(a.project_id)
    )
  );

-- ============================================================================
-- DOCUMENTS TABLE POLICIES
-- ============================================================================

-- Only admins can manage documents
CREATE POLICY "Full admins can manage documents"
  ON public.documents FOR ALL
  USING (public.is_full_admin())
  WITH CHECK (public.is_full_admin());

-- Moderators can view documents
CREATE POLICY "Moderators can view documents"
  ON public.documents FOR SELECT
  USING (public.is_moderator_or_facilitator());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION public.is_full_admin() IS 
  'Returns true if the current user has full admin role';

COMMENT ON FUNCTION public.is_moderator_or_facilitator() IS 
  'Returns true if the current user is a moderator or facilitator';

COMMENT ON FUNCTION public.current_user_id() IS 
  'Returns the profile ID of the current authenticated user';

COMMENT ON FUNCTION public.has_project_access(UUID) IS 
  'Returns true if the current user is a member of the specified project';

COMMENT ON FUNCTION public.has_client_access(UUID) IS 
  'Returns true if the current user has access to any project belonging to the specified client';

COMMENT ON FUNCTION public.is_ask_participant(UUID) IS 
  'Returns true if the current user is a participant in the specified ask session';

