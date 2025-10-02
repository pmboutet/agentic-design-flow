BEGIN;

-- Ensure extensions required by the schema exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- Sequences
CREATE SEQUENCE IF NOT EXISTS public.documents_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.n8n_chat_histories_id_seq;

-- Core tables
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  email VARCHAR,
  company VARCHAR,
  industry VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR NOT NULL UNIQUE,
  password_hash VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  full_name VARCHAR,
  role VARCHAR DEFAULT 'participant',
  avatar_url TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  status VARCHAR NOT NULL DEFAULT 'open',
  priority VARCHAR DEFAULT 'medium',
  category VARCHAR,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ask_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_key VARCHAR NOT NULL UNIQUE,
  name VARCHAR NOT NULL,
  question TEXT NOT NULL,
  description TEXT,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  is_anonymous BOOLEAN DEFAULT false,
  max_participants INTEGER,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ai_config JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ask_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_session_id UUID NOT NULL REFERENCES public.ask_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  participant_name VARCHAR,
  participant_email VARCHAR,
  role VARCHAR DEFAULT 'participant',
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ask_participants_session_user_idx
  ON public.ask_participants (ask_session_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_session_id UUID NOT NULL REFERENCES public.ask_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sender_type VARCHAR NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  message_type VARCHAR DEFAULT 'text',
  metadata JSONB,
  parent_message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ask_session_id UUID NOT NULL REFERENCES public.ask_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  summary TEXT,
  insight_type VARCHAR NOT NULL,
  category VARCHAR,
  priority VARCHAR DEFAULT 'medium',
  status VARCHAR DEFAULT 'new',
  source_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  insight_id UUID NOT NULL REFERENCES public.insights(id) ON DELETE CASCADE,
  relationship_type VARCHAR,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kpi_estimations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_id UUID NOT NULL REFERENCES public.insights(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  description TEXT,
  metric_data JSONB NOT NULL,
  estimation_source VARCHAR,
  confidence_level INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id BIGINT PRIMARY KEY DEFAULT nextval('public.documents_id_seq'),
  content TEXT,
  metadata JSONB,
  embedding vector(1536),
  ts TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.n8n_chat_histories (
  id INTEGER PRIMARY KEY DEFAULT nextval('public.n8n_chat_histories_id_seq'),
  session_id VARCHAR NOT NULL,
  message JSONB NOT NULL
);

COMMIT;

-- //@UNDO
BEGIN;

DROP TABLE IF EXISTS public.challenge_insights CASCADE;
DROP TABLE IF EXISTS public.kpi_estimations CASCADE;
DROP TABLE IF EXISTS public.insights CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.ask_participants CASCADE;
DROP TABLE IF EXISTS public.ask_sessions CASCADE;
DROP TABLE IF EXISTS public.challenges CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.documents CASCADE;
DROP TABLE IF EXISTS public.n8n_chat_histories CASCADE;
DROP SEQUENCE IF EXISTS public.documents_id_seq;
DROP SEQUENCE IF EXISTS public.n8n_chat_histories_id_seq;

COMMIT;
