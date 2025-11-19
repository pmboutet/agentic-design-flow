BEGIN;

-- Split the service role policy from admin policy for better clarity
-- Service role should have its own policy that always allows access

-- Drop the combined policy
DROP POLICY IF EXISTS "Service role and admins can manage security detections" ON public.security_detections;

-- Create separate policy for service role (always allows)
CREATE POLICY "Service role can manage security detections"
  ON public.security_detections FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Ensure admin policy exists (should already exist from migration 046)
-- But recreate it to be safe
DROP POLICY IF EXISTS "Admins can manage security detections" ON public.security_detections;

CREATE POLICY "Admins can manage security detections"
  ON public.security_detections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  );

COMMIT;






