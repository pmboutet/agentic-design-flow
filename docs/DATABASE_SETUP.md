# Database Setup - Supabase Schema

> ⚠️ This document now complements the automated migration runner located in [`scripts/migrate.js`](./scripts/migrate.js). The canonical schema is stored inside [`migrations/001_initial_schema.sql`](./migrations/001_initial_schema.sql); add incremental SQL files for subsequent changes instead of editing the initial script directly.

## Tables Creation

### 1. Core Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    email VARCHAR(255),
    company VARCHAR(255),
    industry VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (corrected with auth fields)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255), -- for custom auth or backup
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'participant',
    avatar_url TEXT,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenges table
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    category VARCHAR(100), -- operational, strategic, cultural, technical
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ASK sessions table
CREATE TABLE ask_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ask_key VARCHAR(255) UNIQUE NOT NULL, -- external facing key
    name VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    is_anonymous BOOLEAN DEFAULT false,
    max_participants INTEGER,
    delivery_mode VARCHAR(20) NOT NULL DEFAULT 'digital', -- physical or digital
    audience_scope VARCHAR(20) NOT NULL DEFAULT 'individual', -- individual or group
    response_mode VARCHAR(20) NOT NULL DEFAULT 'collective', -- collective or simultaneous
    challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ai_config JSONB, -- AI configuration (personality, style, etc.)
    metadata JSONB, -- flexible field for additional data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ASK session participants junction table
CREATE TABLE ask_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ask_session_id UUID NOT NULL REFERENCES ask_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    participant_name VARCHAR(255), -- for anonymous participants
    participant_email VARCHAR(255), -- for anonymous participants
    role VARCHAR(50) DEFAULT 'participant',
    is_spokesperson BOOLEAN DEFAULT false,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(ask_session_id, user_id)
);

-- Conversation messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ask_session_id UUID NOT NULL REFERENCES ask_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    sender_type VARCHAR(20) NOT NULL DEFAULT 'user', -- user, ai, system
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text', -- text, audio, image, document
    metadata JSONB, -- file info, audio duration, etc.
    parent_message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insights table (better name than feedbacks)
CREATE TABLE insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ask_session_id UUID NOT NULL REFERENCES ask_sessions(id) ON DELETE CASCADE,
    ask_id UUID GENERATED ALWAYS AS (ask_session_id) STORED,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    challenge_id UUID REFERENCES challenges(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    summary TEXT,
    insight_type VARCHAR(20) NOT NULL, -- pain, gain, opportunity, risk, suggestion
    category VARCHAR(100), -- communication, process, technology, culture
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'new', -- new, reviewed, implemented, rejected
    source_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    ai_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KPI estimations table
CREATE TABLE kpi_estimations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_data JSONB NOT NULL, -- flexible structure for different KPI types
    estimation_source VARCHAR(50), -- ai, expert, historical_data
    confidence_level INTEGER DEFAULT 50, -- 0-100
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenge-Insight relationships (many-to-many)
CREATE TABLE challenge_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50), -- addresses, relates_to, conflicts_with
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(challenge_id, insight_id)
);
```

### 2. Indexes & Performance

```sql
-- Indexes for performance
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_client_id ON users(client_id);
CREATE INDEX idx_projects_client_id ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_challenges_project_id ON challenges(project_id);
CREATE INDEX idx_challenges_status ON challenges(status);
CREATE INDEX idx_ask_sessions_ask_key ON ask_sessions(ask_key);
CREATE INDEX idx_ask_sessions_project_id ON ask_sessions(project_id);
CREATE INDEX idx_ask_sessions_status ON ask_sessions(status);
CREATE INDEX idx_messages_ask_session_id ON messages(ask_session_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_insights_ask_session_id ON insights(ask_session_id);
CREATE INDEX idx_insights_ask_id ON insights(ask_id);
CREATE INDEX idx_insights_challenge_id ON insights(challenge_id);
CREATE INDEX idx_insights_type ON insights(insight_type);
CREATE INDEX idx_kpi_estimations_insight_id ON kpi_estimations(insight_id);
```

### 3. Triggers & Functions

```sql
-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_challenges_updated_at BEFORE UPDATE ON challenges
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ask_sessions_updated_at BEFORE UPDATE ON ask_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insights_updated_at BEFORE UPDATE ON insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpi_estimations_updated_at BEFORE UPDATE ON kpi_estimations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## Test Data

### 1. Test Client, User & Project

```sql
-- Insert test client
INSERT INTO clients (id, name, company, industry, email, status) VALUES 
('550e8400-e29b-41d4-a716-446655440001', 'TechCorp Solutions', 'TechCorp Inc.', 'Software Development', 'contact@techcorp.com', 'active');

-- Insert test users
INSERT INTO users (id, email, password_hash, first_name, last_name, full_name, role, client_id, is_active) VALUES 
('550e8400-e29b-41d4-a716-446655440011', 'pierre.marie@techcorp.com', '$2a$10$example_hash_here', 'Pierre-Marie', 'Boutet', 'Pierre-Marie Boutet', 'facilitator', '550e8400-e29b-41d4-a716-446655440001', true),
('550e8400-e29b-41d4-a716-446655440012', 'sarah.manager@techcorp.com', '$2a$10$example_hash_here2', 'Sarah', 'Martin', 'Sarah Martin', 'manager', '550e8400-e29b-41d4-a716-446655440001', true),
('550e8400-e29b-41d4-a716-446655440013', 'dev.team@techcorp.com', '$2a$10$example_hash_here3', 'Alex', 'Developer', 'Alex Developer', 'participant', '550e8400-e29b-41d4-a716-446655440001', true);

-- Insert test project
INSERT INTO projects (id, name, description, start_date, end_date, status, client_id, created_by) VALUES 
('550e8400-e29b-41d4-a716-446655440021', 'Team Productivity Enhancement', 'Analyzing and improving team workflow efficiency and communication', '2025-09-15 09:00:00+00', '2025-12-15 18:00:00+00', 'active', '550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440011');

-- Insert test challenge
INSERT INTO challenges (id, name, description, status, priority, category, project_id, created_by) VALUES 
('550e8400-e29b-41d4-a716-446655440031', 'Communication Bottlenecks', 'Team experiencing delays due to unclear communication channels and decision-making processes', 'open', 'high', 'operational', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440012');

-- Insert test ASK session
INSERT INTO ask_sessions (id, ask_key, name, question, description, start_date, end_date, status, challenge_id, project_id, created_by, delivery_mode, audience_scope, response_mode, ai_config, metadata) VALUES
('550e8400-e29b-41d4-a716-446655440041', 'team-productivity-session-001', 'Team Productivity Deep Dive', 'Our team is struggling with meeting deadlines and communication gaps. What systemic changes could improve our workflow efficiency?', 'Interactive session to identify productivity blockers and generate actionable improvement strategies', '2025-09-15 14:00:00+00', '2025-09-16 14:00:00+00', 'active', '550e8400-e29b-41d4-a716-446655440031', '550e8400-e29b-41d4-a716-446655440021', '550e8400-e29b-41d4-a716-446655440011',
'physical', 'group', 'simultaneous',
'{"personality": "analytical", "questioning_style": "exploratory", "response_depth": "detailed", "language": "en"}',
'{"department": "Product Development", "team_size": 8, "industry": "SaaS", "priority": "high"}');

-- Insert test participants
INSERT INTO ask_participants (ask_session_id, user_id, role) VALUES 
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440012', 'facilitator'),
('550e8400-e29b-41d4-a716-446655440041', '550e8400-e29b-41d4-a716-446655440013', 'participant');

-- Insert initial AI welcome message
INSERT INTO messages (ask_session_id, sender_type, content, message_type) VALUES 
('550e8400-e29b-41d4-a716-446655440041', 'ai', 'Hello! I''m here to help you identify and analyze the productivity challenges your team is facing. Let''s start by understanding your current situation. What specific bottlenecks or communication issues have you noticed in your daily workflow?', 'text');
```

## Usage

### Test URLs for development:

```
# Test with real ASK key
https://your-app.vercel.app/?key=team-productivity-session-001

# Test mode (no backend required)
https://your-app.vercel.app/?key=team-productivity-session-001&mode=test

# ASK key validation page
https://your-app.vercel.app/test-key
```

### Supabase Setup:

1. Create a new Supabase project
2. Run the schema SQL in the SQL Editor
3. Insert the test data
4. Configure Row Level Security as needed
5. Update your environment variables with Supabase credentials

### Environment Variables:

```env
# Supabase credentials (synced automatically by the Vercel ↔ Supabase integration)
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
# Never expose the service role key or JWT secret in client-side code or public repos

# Expose the project URL and anon key to the browser for Supabase client access
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Postgres connection strings Vercel keeps in sync (helpful for SQL tooling and migrations)
POSTGRES_URL=postgresql://user:password@host:6543/postgres
POSTGRES_PRISMA_URL=postgresql://user:password@host:5432/postgres?pgbouncer=true&connection_limit=1
POSTGRES_URL_NON_POOLING=postgresql://user:password@host:5432/postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=super-secret-password
POSTGRES_HOST=db.supabase.co
POSTGRES_DATABASE=postgres

# AI providers
ANTHROPIC_API_KEY=sk-ant-...
MISTRAL_API_KEY=sk-mistral-...
```

### Nouvelles tables IA à vérifier

- `ai_model_configs` : configuration des fournisseurs (code, modèle, URL, variable d'environnement).
- `ai_agents` : prompts `system`/`user`, modèles associés et variables autorisées.
- `ai_agent_logs` : journal des requêtes et réponses IA.
- `ai_insight_jobs` : file d'attente pour la détection séquentielle des insights.


## Post-migration validation for ASK sessions

- Check that the new session columns exist:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'ask_sessions'
  AND column_name IN ('delivery_mode', 'audience_scope', 'response_mode');
```

- Ensure the `ask_participants.is_spokesperson` flag is available and aligned with historic data:

```sql
ALTER TABLE ask_participants
  ADD COLUMN IF NOT EXISTS is_spokesperson BOOLEAN DEFAULT false;

UPDATE ask_participants
SET is_spokesperson = TRUE
WHERE role = 'spokesperson';
```

- Normalise legacy ASK sessions so the admin dashboard receives consistent metadata:

```sql
UPDATE ask_sessions
SET delivery_mode = COALESCE(delivery_mode, 'digital'),
    audience_scope = COALESCE(audience_scope, CASE WHEN max_participants = 1 THEN 'individual' ELSE 'group' END),
    response_mode = COALESCE(response_mode, 'collective')
WHERE delivery_mode IS NULL OR audience_scope IS NULL OR response_mode IS NULL;
```


- Run `vercel env pull .env.local` to copy the integration-managed variables into a local `.env.local` file for development.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` allow the front-end to connect to Supabase.
- `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` provide privileged access and must stay server-side (environment variables only).
- Use the `POSTGRES_*` variables for migrations, connecting BI tools, or executing SQL scripts locally instead of crafting a custom connection string.

