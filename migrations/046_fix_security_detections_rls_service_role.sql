BEGIN;

-- Allow service role to bypass RLS for security_detections table
-- Service role is identified by auth.role() = 'service_role'
-- This is needed for admin API operations that use getAdminSupabaseClient()

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all security detections" ON public.security_detections;
DROP POLICY IF EXISTS "Admins can manage security detections" ON public.security_detections;

-- Create policies that allow service role (admin operations) and regular admins
CREATE POLICY "Service role and admins can view all security detections"
  ON public.security_detections FOR SELECT
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  );

CREATE POLICY "Service role and admins can manage security detections"
  ON public.security_detections FOR ALL
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  );

COMMIT;

