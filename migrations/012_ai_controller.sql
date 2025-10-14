BEGIN;

-- Drop legacy n8n tables
DROP TABLE IF EXISTS public.n8n_chat_histories CASCADE;
DROP SEQUENCE IF EXISTS public.n8n_chat_histories_id_seq;

-- Extend core domain objects with system prompt overrides
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

ALTER TABLE public.ask_sessions
  ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Model configuration table to describe available providers
CREATE TABLE IF NOT EXISTS public.ai_model_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  provider VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  base_url TEXT,
  api_key_env_var VARCHAR NOT NULL,
  additional_headers JSONB,
  is_default BOOLEAN DEFAULT false,
  is_fallback BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent definitions with prompts and template metadata
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  description TEXT,
  model_config_id UUID REFERENCES public.ai_model_configs(id) ON DELETE SET NULL,
  fallback_model_config_id UUID REFERENCES public.ai_model_configs(id) ON DELETE SET NULL,
  system_prompt TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  available_variables TEXT[] DEFAULT '{}'::TEXT[],
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Logs to keep track of each request/response with an AI provider
CREATE TABLE IF NOT EXISTS public.ai_agent_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  model_config_id UUID REFERENCES public.ai_model_configs(id) ON DELETE SET NULL,
  ask_session_id UUID REFERENCES public.ask_sessions(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  interaction_type VARCHAR NOT NULL,
  request_payload JSONB NOT NULL,
  response_payload JSONB,
  status VARCHAR NOT NULL DEFAULT 'pending',
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_agent_logs_agent_id_idx
  ON public.ai_agent_logs (agent_id);

CREATE INDEX IF NOT EXISTS ai_agent_logs_ask_session_id_idx
  ON public.ai_agent_logs (ask_session_id);

-- Insight detection job queue to avoid concurrent processing
CREATE TABLE IF NOT EXISTS public.ai_insight_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_session_id UUID NOT NULL REFERENCES public.ask_sessions(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  model_config_id UUID REFERENCES public.ai_model_configs(id) ON DELETE SET NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_insight_jobs_active_session_idx
  ON public.ai_insight_jobs (ask_session_id)
  WHERE status IN ('pending', 'processing');

COMMIT;

-- //@UNDO
BEGIN;

DROP INDEX IF EXISTS ai_insight_jobs_active_session_idx;
DROP TABLE IF EXISTS public.ai_insight_jobs CASCADE;
DROP INDEX IF EXISTS ai_agent_logs_ask_session_id_idx;
DROP INDEX IF EXISTS ai_agent_logs_agent_id_idx;
DROP TABLE IF EXISTS public.ai_agent_logs CASCADE;
DROP TABLE IF EXISTS public.ai_agents CASCADE;
DROP TABLE IF EXISTS public.ai_model_configs CASCADE;
ALTER TABLE public.ask_sessions DROP COLUMN IF EXISTS system_prompt;
ALTER TABLE public.challenges DROP COLUMN IF EXISTS system_prompt;
ALTER TABLE public.projects DROP COLUMN IF EXISTS system_prompt;

COMMIT;
