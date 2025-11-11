BEGIN;

-- Create table for ask prompt templates
CREATE TABLE IF NOT EXISTS public.ask_prompt_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS ask_prompt_templates_created_by_idx
  ON public.ask_prompt_templates (created_by);

-- Enable RLS
ALTER TABLE public.ask_prompt_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can do everything
CREATE POLICY "Admins can manage all templates"
  ON public.ask_prompt_templates
  FOR ALL
  USING (public.is_full_admin());

-- All authenticated users can read templates (they are global)
CREATE POLICY "Authenticated users can read templates"
  ON public.ask_prompt_templates
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT ON public.ask_prompt_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ask_prompt_templates TO authenticated;

COMMIT;

-- //@UNDO
BEGIN;

DROP POLICY IF EXISTS "Authenticated users can read templates" ON public.ask_prompt_templates;
DROP POLICY IF EXISTS "Admins can manage all templates" ON public.ask_prompt_templates;
DROP INDEX IF EXISTS ask_prompt_templates_created_by_idx;
DROP TABLE IF EXISTS public.ask_prompt_templates CASCADE;

COMMIT;

