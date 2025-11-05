BEGIN;

-- Allow service role to bypass RLS for graph tables
-- Service role is identified by auth.role() = 'service_role'

-- Drop existing admin policies that might conflict
DROP POLICY IF EXISTS "Admins can manage knowledge graph edges" ON public.knowledge_graph_edges;
DROP POLICY IF EXISTS "Admins can manage knowledge entities" ON public.knowledge_entities;
DROP POLICY IF EXISTS "Admins can manage insight syntheses" ON public.insight_syntheses;
DROP POLICY IF EXISTS "Admins can manage insight keywords" ON public.insight_keywords;

-- Create policies that allow service role (admin operations) and regular admins
CREATE POLICY "Service role and admins can manage knowledge graph edges" 
  ON public.knowledge_graph_edges
  FOR ALL 
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

CREATE POLICY "Service role and admins can manage knowledge entities" 
  ON public.knowledge_entities
  FOR ALL 
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

CREATE POLICY "Service role and admins can manage insight syntheses" 
  ON public.insight_syntheses
  FOR ALL 
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

CREATE POLICY "Service role and admins can manage insight keywords" 
  ON public.insight_keywords
  FOR ALL 
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.auth_id = auth.uid() 
      AND profiles.role IN ('admin', 'full_admin')
    )
  );

COMMIT;

