-- Pre-migration check: Verify participants without user_id
-- Run this BEFORE migration 044 to see what will be deleted

-- Count orphan participants
SELECT
  COUNT(*) as orphan_count,
  COUNT(*) FILTER (WHERE invite_token IS NOT NULL) as orphans_with_token
FROM public.ask_participants
WHERE user_id IS NULL;

-- Show details of orphan participants
SELECT
  ap.id,
  ap.ask_session_id,
  ap.participant_email,
  ap.participant_name,
  ap.invite_token,
  ap.role,
  ap.joined_at,
  ask.ask_key,
  ask.name as ask_name,
  ask.question
FROM public.ask_participants ap
LEFT JOIN public.ask_sessions ask ON ap.ask_session_id = ask.id
WHERE ap.user_id IS NULL
ORDER BY ap.joined_at DESC;

-- Show ASK sessions that will lose participants
SELECT
  ask.id,
  ask.ask_key,
  ask.name,
  ask.question,
  COUNT(*) as orphan_participant_count
FROM public.ask_sessions ask
INNER JOIN public.ask_participants ap ON ap.ask_session_id = ask.id
WHERE ap.user_id IS NULL
GROUP BY ask.id, ask.ask_key, ask.name, ask.question
ORDER BY orphan_participant_count DESC;

-- Show messages from orphan participants (will lose attribution)
SELECT
  COUNT(*) as message_count_from_orphans
FROM public.messages m
WHERE m.user_id IS NULL;

-- Summary
SELECT
  'Orphan Participants' as category,
  COUNT(*) as count
FROM public.ask_participants
WHERE user_id IS NULL
UNION ALL
SELECT
  'Participants with user_id' as category,
  COUNT(*) as count
FROM public.ask_participants
WHERE user_id IS NOT NULL;
