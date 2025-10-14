BEGIN;

CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_members_project_user_idx
  ON public.project_members (project_id, user_id);

COMMIT;

-- //@UNDO
BEGIN;

DROP TABLE IF EXISTS public.project_members CASCADE;

COMMIT;
