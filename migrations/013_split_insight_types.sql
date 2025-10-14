BEGIN;

CREATE TABLE IF NOT EXISTS public.insight_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.insight_types (name)
VALUES
  ('pain'),
  ('gain'),
  ('opportunity'),
  ('risk'),
  ('signal'),
  ('idea')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS insight_type_id UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'insights'
      AND column_name = 'type'
  ) THEN
    UPDATE public.insights AS insights
    SET insight_type_id = insight_types.id
    FROM public.insight_types AS insight_types
    WHERE insights.insight_type_id IS NULL
      AND insight_types.name = insights.type;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'insights'
      AND column_name = 'insight_type'
  ) THEN
    UPDATE public.insights AS insights
    SET insight_type_id = insight_types.id
    FROM public.insight_types AS insight_types
    WHERE insights.insight_type_id IS NULL
      AND insight_types.name = insights.insight_type;
  END IF;
END $$;

UPDATE public.insights AS insights
SET insight_type_id = (
  SELECT id FROM public.insight_types WHERE name = 'idea'
)
WHERE insights.insight_type_id IS NULL;

ALTER TABLE public.insights
  ALTER COLUMN insight_type_id SET NOT NULL;

ALTER TABLE public.insights
  ADD CONSTRAINT insights_insight_type_id_fkey
    FOREIGN KEY (insight_type_id) REFERENCES public.insight_types(id) ON DELETE RESTRICT;

ALTER TABLE public.insights
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS insight_type;

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS type TEXT;

UPDATE public.insights AS insights
SET type = insight_types.name
FROM public.insight_types AS insight_types
WHERE insights.insight_type_id = insight_types.id;

ALTER TABLE public.insights
  DROP CONSTRAINT IF EXISTS insights_insight_type_id_fkey;

ALTER TABLE public.insights
  DROP COLUMN IF EXISTS insight_type_id;

DROP TABLE IF EXISTS public.insight_types;

COMMIT;
