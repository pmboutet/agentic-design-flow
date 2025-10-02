BEGIN;

CREATE TABLE IF NOT EXISTS public.insight_authors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_id UUID NOT NULL REFERENCES public.insights(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insight_authors_insight_id_idx
  ON public.insight_authors (insight_id);

COMMIT;

-- //@UNDO
BEGIN;

DROP TABLE IF EXISTS public.insight_authors CASCADE;

COMMIT;
