BEGIN;

-- Enable Row Level Security on all main tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_estimations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = auth_id);

-- Users can view profiles from the same client
CREATE POLICY "Users can view same client profiles"
  ON public.profiles FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = auth_id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- ============================================================================
-- CLIENTS POLICIES
-- ============================================================================

-- Users can view their own client
CREATE POLICY "Users can view own client"
  ON public.clients FOR SELECT
  USING (
    id IN (
      SELECT client_id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

-- Admins can view all clients
CREATE POLICY "Admins can view all clients"
  ON public.clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- Admins can manage clients
CREATE POLICY "Admins can manage clients"
  ON public.clients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role = 'full_admin'
    )
  );

-- ============================================================================
-- PROJECT_MEMBERS POLICIES
-- ============================================================================

-- Users can view their own project memberships
CREATE POLICY "Users can view own memberships"
  ON public.project_members FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

-- Admins and project members can view project memberships
CREATE POLICY "Project members can view team"
  ON public.project_members FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Admins can manage project members
CREATE POLICY "Admins can manage project members"
  ON public.project_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- ============================================================================
-- PROJECTS POLICIES
-- ============================================================================

-- Users can view projects they are members of
CREATE POLICY "Members can view their projects"
  ON public.projects FOR SELECT
  USING (
    id IN (
      SELECT project_id FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Users can view projects from their client
CREATE POLICY "Users can view client projects"
  ON public.projects FOR SELECT
  USING (
    client_id IN (
      SELECT client_id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

-- Admins can manage all projects
CREATE POLICY "Admins can manage projects"
  ON public.projects FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin')
    )
  );

-- ============================================================================
-- CHALLENGES POLICIES
-- ============================================================================

-- Users can view challenges from projects they belong to
CREATE POLICY "Members can view project challenges"
  ON public.challenges FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Admins and facilitators can manage challenges
CREATE POLICY "Facilitators can manage challenges"
  ON public.challenges FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin', 'facilitator', 'manager')
    )
  );

-- ============================================================================
-- ASK_SESSIONS POLICIES
-- ============================================================================

-- Participants can view sessions they are part of
CREATE POLICY "Participants can view their sessions"
  ON public.ask_sessions FOR SELECT
  USING (
    id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Users can view sessions from their projects
CREATE POLICY "Members can view project sessions"
  ON public.ask_sessions FOR SELECT
  USING (
    project_id IN (
      SELECT project_id FROM public.project_members pm
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Facilitators can manage ask sessions
CREATE POLICY "Facilitators can manage sessions"
  ON public.ask_sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin', 'facilitator')
    )
  );

-- ============================================================================
-- ASK_PARTICIPANTS POLICIES
-- ============================================================================

-- Users can view participants in their sessions
CREATE POLICY "Users can view session participants"
  ON public.ask_participants FOR SELECT
  USING (
    ask_session_id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Facilitators can manage participants
CREATE POLICY "Facilitators can manage participants"
  ON public.ask_participants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin', 'facilitator')
    )
  );

-- ============================================================================
-- MESSAGES POLICIES
-- ============================================================================

-- Participants can view messages in their sessions
CREATE POLICY "Participants can view session messages"
  ON public.messages FOR SELECT
  USING (
    ask_session_id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Participants can insert messages in their sessions
CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    ask_session_id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Users can only insert messages as themselves
CREATE POLICY "Users send as themselves"
  ON public.messages FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.profiles WHERE auth_id = auth.uid()
    )
  );

-- ============================================================================
-- INSIGHTS POLICIES
-- ============================================================================

-- Users can view insights from their sessions
CREATE POLICY "Users can view session insights"
  ON public.insights FOR SELECT
  USING (
    ask_session_id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Facilitators can manage insights
CREATE POLICY "Facilitators can manage insights"
  ON public.insights FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin', 'facilitator', 'manager')
    )
  );

-- ============================================================================
-- CHALLENGE_INSIGHTS POLICIES
-- ============================================================================

-- Users can view challenge-insight relationships for their projects
CREATE POLICY "Users can view challenge insights"
  ON public.challenge_insights FOR SELECT
  USING (
    challenge_id IN (
      SELECT c.id FROM public.challenges c
      JOIN public.project_members pm ON pm.project_id = c.project_id
      JOIN public.profiles p ON p.id = pm.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Facilitators can manage challenge-insight relationships
CREATE POLICY "Facilitators can manage challenge insights"
  ON public.challenge_insights FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin', 'facilitator', 'manager')
    )
  );

-- ============================================================================
-- KPI_ESTIMATIONS POLICIES
-- ============================================================================

-- Users can view KPI estimations from insights they have access to
CREATE POLICY "Users can view kpi estimations"
  ON public.kpi_estimations FOR SELECT
  USING (
    insight_id IN (
      SELECT i.id FROM public.insights i
      JOIN public.ask_participants ap ON ap.ask_session_id = i.ask_session_id
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Facilitators can manage KPI estimations
CREATE POLICY "Facilitators can manage kpi estimations"
  ON public.kpi_estimations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'project_admin', 'facilitator', 'manager')
    )
  );

COMMIT;

-- //@UNDO
BEGIN;

-- Drop all policies
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

-- Disable RLS
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ask_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_estimations DISABLE ROW LEVEL SECURITY;

COMMIT;

