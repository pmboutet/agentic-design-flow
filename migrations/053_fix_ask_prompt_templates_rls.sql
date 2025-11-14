BEGIN;

-- Drop the existing policy that uses auth.role()
DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.ask_prompt_templates;

-- Create a new policy that checks if user is authenticated using auth.uid()
CREATE POLICY "Authenticated users can read templates"
  ON public.ask_prompt_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

COMMIT;

-- //@UNDO
BEGIN;

DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.ask_prompt_templates;

-- Restore original policy
CREATE POLICY "Authenticated users can read templates"
  ON public.ask_prompt_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

COMMIT;





