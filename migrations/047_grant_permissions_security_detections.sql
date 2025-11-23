BEGIN;

-- Grant explicit permissions to service_role for security_detections table
-- This ensures the service role can access the table even with RLS enabled
-- The service role should bypass RLS, but explicit grants ensure compatibility

-- Grant all permissions on security_detections
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_detections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_detections TO authenticated;

-- Grant all permissions on security_monitoring_queue (for consistency)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_monitoring_queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_monitoring_queue TO authenticated;

COMMIT;








