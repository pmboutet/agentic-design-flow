# RLS Quick Start Guide

## 🎉 RLS is Now Active!

Your database now has comprehensive Row Level Security protecting all tables.

---

## 📋 Quick Reference

### Permission Levels

| Role | Access Level |
|------|-------------|
| **Admin** / **Full Admin** | Full access to everything |
| **Moderator** / **Facilitator** | Full access to their projects + related data |
| **Participant** (and others) | Access to sessions they participate in |

---

## 🚀 Quick Actions

### 1. Make Someone an Admin

```sql
UPDATE profiles 
SET role = 'admin' 
WHERE email = 'user@example.com';
```

### 2. Make Someone a Moderator

```sql
-- Set role
UPDATE profiles 
SET role = 'moderator' 
WHERE email = 'user@example.com';

-- Add to project
INSERT INTO project_members (project_id, user_id, role)
VALUES ('project-uuid', 'user-uuid', 'moderator');
```

### 3. Add Participant to Ask Session

```sql
INSERT INTO ask_participants (ask_session_id, user_id)
VALUES ('session-uuid', 'user-uuid');
```

---

## 🔍 Check What You Have Access To

```sql
-- Am I an admin?
SELECT public.is_full_admin();

-- What's my user ID?
SELECT public.current_user_id();

-- Can I access this project?
SELECT public.has_project_access('project-uuid');

-- Am I in this session?
SELECT public.is_ask_participant('session-uuid');
```

---

## ⚠️ Important Notes

### For Developers

**Use the right Supabase client:**

```typescript
// ✅ For user requests (respects RLS)
const supabase = createClient(url, ANON_KEY);

// ⚠️ For system operations only (bypasses RLS)
const supabaseAdmin = createClient(url, SERVICE_ROLE_KEY);
```

### For Admins

**Service role bypasses ALL security:**
- Only use in backend server code
- Never expose service role key to frontend
- Use authenticated client for user-initiated requests

---

## 📚 Documentation

| Document | When to Use |
|----------|-------------|
| **RLS_QUICK_START.md** | Quick reference (you are here) |
| **RLS_PERMISSIONS_MATRIX.md** | See all permissions in a table |
| **RLS_SECURITY_GUIDE.md** | Detailed guide with examples |
| **RLS_IMPLEMENTATION_COMPLETE.md** | Implementation details |

---

## 🐛 Common Issues

### "Permission denied"
→ Check user's role and memberships

### "Can't see my projects"
→ Add user to `project_members`

### "Can't see session messages"
→ Add user to `ask_participants`

### "Nothing works for anyone"
→ You might be using service role key in frontend (switch to anon key)

---

## ✅ Migration Status

```bash
# Check migration status
NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/migrate.js status

# Should show:
# ✅ 014 enable_rls_security
```

---

## 🎯 What's Protected

**All 18 tables are protected:**
- profiles, clients, projects, project_members
- challenges, ask_sessions, ask_participants
- messages, insights, insight_authors, insight_types
- challenge_insights, challenge_foundation_insights
- kpi_estimations
- ai_agents, ai_model_configs, ai_agent_logs, ai_insight_jobs
- documents

---

**For detailed information, see:** [RLS_SECURITY_GUIDE.md](./RLS_SECURITY_GUIDE.md)

