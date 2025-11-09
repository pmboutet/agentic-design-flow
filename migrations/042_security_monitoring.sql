BEGIN;

-- ============================================================================
-- 1. Add quarantine columns to profiles table
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quarantined_reason TEXT;

CREATE INDEX IF NOT EXISTS profiles_is_quarantined_idx
  ON public.profiles (is_quarantined)
  WHERE is_quarantined = true;

-- ============================================================================
-- 2. Create security_detections table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_detections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  detection_type VARCHAR(50) NOT NULL, -- injection, xss, spam, length, etc.
  severity VARCHAR(20) NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  matched_patterns JSONB, -- Array of patterns that matched
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, reviewed, resolved, false_positive
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_detections_message_id_idx
  ON public.security_detections (message_id);

CREATE INDEX IF NOT EXISTS security_detections_profile_id_idx
  ON public.security_detections (profile_id);

CREATE INDEX IF NOT EXISTS security_detections_status_idx
  ON public.security_detections (status);

CREATE INDEX IF NOT EXISTS security_detections_severity_idx
  ON public.security_detections (severity);

CREATE INDEX IF NOT EXISTS security_detections_created_at_idx
  ON public.security_detections (created_at DESC);

-- ============================================================================
-- 3. Create security_monitoring_queue table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_monitoring_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_monitoring_queue_status_idx
  ON public.security_monitoring_queue (status)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS security_monitoring_queue_message_id_idx
  ON public.security_monitoring_queue (message_id);

CREATE INDEX IF NOT EXISTS security_monitoring_queue_created_at_idx
  ON public.security_monitoring_queue (created_at);

-- ============================================================================
-- 4. Function to detect malicious content
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_malicious_content(content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  detections JSONB := '[]'::JSONB;
  detection JSONB;
  content_lower TEXT;
  content_length INTEGER;
  max_length INTEGER := 10000;
BEGIN
  content_lower := LOWER(content);
  content_length := LENGTH(content);

  -- Check for excessive length
  IF content_length > max_length THEN
    detection := jsonb_build_object(
      'type', 'length',
      'severity', 'medium',
      'pattern', format('Message length: %s characters (max: %s)', content_length, max_length),
      'details', jsonb_build_object('length', content_length, 'max_length', max_length)
    );
    detections := detections || jsonb_build_array(detection);
  END IF;

  -- SQL Injection patterns
  IF content_lower ~* '(union\s+select|drop\s+table|delete\s+from|insert\s+into|update\s+set|exec\s*\(|execute\s*\(|''\s*or\s*''1''\s*=\s*''1|''\s*or\s*1\s*=\s*1|''\s*or\s*''a''\s*=\s*''a)' THEN
    detection := jsonb_build_object(
      'type', 'injection',
      'severity', 'critical',
      'pattern', 'SQL injection pattern detected',
      'details', jsonb_build_object('matched', 'SQL injection keywords')
    );
    detections := detections || jsonb_build_array(detection);
  END IF;

  -- XSS patterns
  IF content_lower ~* '(<script|javascript:|onerror\s*=|onclick\s*=|onload\s*=|eval\s*\(|alert\s*\()' THEN
    detection := jsonb_build_object(
      'type', 'xss',
      'severity', 'high',
      'pattern', 'XSS pattern detected',
      'details', jsonb_build_object('matched', 'XSS keywords')
    );
    detections := detections || jsonb_build_array(detection);
  END IF;

  -- Spam patterns: excessive repetition
  IF content_length > 100 THEN
    -- Check for repeated character sequences (more than 10 times)
    IF content_lower ~* '(.)\1{20,}' THEN
      detection := jsonb_build_object(
        'type', 'spam',
        'severity', 'low',
        'pattern', 'Excessive character repetition',
        'details', jsonb_build_object('matched', 'Repeated characters')
      );
      detections := detections || jsonb_build_array(detection);
    END IF;

    -- Check for suspicious URLs (basic pattern)
    IF content_lower ~* '(http[s]?://[^\s]+|www\.[^\s]+|bit\.ly|tinyurl|t\.co)' THEN
      -- Count URLs
      DECLARE
        url_count INTEGER;
      BEGIN
        SELECT COUNT(*) INTO url_count
        FROM regexp_split_to_table(content_lower, '\s+') AS word
        WHERE word ~* '(http[s]?://|www\.|bit\.ly|tinyurl|t\.co)';
        
        IF url_count > 3 THEN
          detection := jsonb_build_object(
            'type', 'spam',
            'severity', 'medium',
            'pattern', format('Multiple suspicious URLs detected: %s', url_count),
            'details', jsonb_build_object('url_count', url_count)
          );
          detections := detections || jsonb_build_array(detection);
        END IF;
      END;
    END IF;
  END IF;

  -- Command injection patterns
  IF content_lower ~* '(;|\||&|`|\$\(|<\s*\(|>\s*\(|cat\s+/etc/passwd|rm\s+-rf|wget\s+|curl\s+)' THEN
    detection := jsonb_build_object(
      'type', 'injection',
      'severity', 'high',
      'pattern', 'Command injection pattern detected',
      'details', jsonb_build_object('matched', 'Command injection keywords')
    );
    detections := detections || jsonb_build_array(detection);
  END IF;

  RETURN detections;
END;
$$;

-- ============================================================================
-- 5. Function to quarantine a profile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.quarantine_profile(
  profile_id UUID,
  reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    is_quarantined = true,
    quarantined_at = now(),
    quarantined_reason = reason,
    updated_at = now()
  WHERE id = profile_id;
END;
$$;

-- ============================================================================
-- 6. Function to release a profile from quarantine
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_profile_from_quarantine(
  profile_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    is_quarantined = false,
    quarantined_at = NULL,
    quarantined_reason = NULL,
    updated_at = now()
  WHERE id = profile_id;
END;
$$;

-- ============================================================================
-- 7. Trigger function to add messages to monitoring queue
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_security_monitoring()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only monitor user messages
  IF NEW.sender_type = 'user' THEN
    INSERT INTO public.security_monitoring_queue (message_id, status)
    VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS messages_security_monitoring_trigger ON public.messages;
CREATE TRIGGER messages_security_monitoring_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_security_monitoring();

-- ============================================================================
-- 8. Enable RLS on new tables
-- ============================================================================

ALTER TABLE public.security_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_monitoring_queue ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. RLS Policies for security_detections
-- ============================================================================

-- Admins can view all security detections
CREATE POLICY "Admins can view all security detections"
  ON public.security_detections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  );

-- Admins can manage security detections
CREATE POLICY "Admins can manage security detections"
  ON public.security_detections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND role IN ('full_admin', 'admin')
    )
  );

-- ============================================================================
-- 10. RLS Policies for security_monitoring_queue
-- ============================================================================

-- Only service role can access the queue (for processing)
-- Regular users cannot see the queue
CREATE POLICY "Service role can manage monitoring queue"
  ON public.security_monitoring_queue FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 11. RLS Policy: Quarantined profiles cannot insert messages
-- ============================================================================

-- Drop existing policy if it exists and recreate with quarantine check
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    -- Must be a participant in the session
    ask_session_id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
    -- AND not quarantined
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_id = auth.uid()
      AND is_quarantined = true
    )
  );

COMMIT;

-- //@UNDO
BEGIN;

-- Drop trigger
DROP TRIGGER IF EXISTS messages_security_monitoring_trigger ON public.messages;

-- Drop functions
DROP FUNCTION IF EXISTS public.trigger_security_monitoring();
DROP FUNCTION IF EXISTS public.release_profile_from_quarantine(UUID);
DROP FUNCTION IF EXISTS public.quarantine_profile(UUID, TEXT);
DROP FUNCTION IF EXISTS public.detect_malicious_content(TEXT);

-- Drop RLS policies
DROP POLICY IF EXISTS "Admins can view all security detections" ON public.security_detections;
DROP POLICY IF EXISTS "Admins can manage security detections" ON public.security_detections;
DROP POLICY IF EXISTS "Service role can manage monitoring queue" ON public.security_monitoring_queue;

-- Recreate original messages policy
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    ask_session_id IN (
      SELECT ask_session_id FROM public.ask_participants ap
      JOIN public.profiles p ON p.id = ap.user_id
      WHERE p.auth_id = auth.uid()
    )
  );

-- Disable RLS
ALTER TABLE public.security_detections DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_monitoring_queue DISABLE ROW LEVEL SECURITY;

-- Drop tables
DROP TABLE IF EXISTS public.security_monitoring_queue CASCADE;
DROP TABLE IF EXISTS public.security_detections CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS public.profiles_is_quarantined_idx;

-- Remove columns from profiles
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS is_quarantined,
  DROP COLUMN IF EXISTS quarantined_at,
  DROP COLUMN IF EXISTS quarantined_reason;

COMMIT;

