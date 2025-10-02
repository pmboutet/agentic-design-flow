BEGIN;

ALTER TABLE public.insights
  ADD COLUMN IF NOT EXISTS ask_id UUID GENERATED ALWAYS AS (ask_session_id) STORED;

CREATE INDEX IF NOT EXISTS insights_ask_id_idx
  ON public.insights (ask_id);

COMMIT;

-- //@UNDO
BEGIN;

ALTER TABLE public.insights
  DROP COLUMN IF EXISTS ask_id;

COMMIT;
