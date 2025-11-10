# Voice Mode Fixes - Changelog

## Date: 2025-11-10

### Summary

Fixed two critical issues with voice mode:
1. Microphone continuing to record after mute
2. 403 Forbidden errors when posting voice messages via invite tokens

---

## Issue 1: Microphone Continues Recording After Mute

### Problem

When muting the microphone in voice mode, two separate audio streams existed:
- **Deepgram agent stream**: Used for actual recording and sending to Deepgram
- **Visualization stream**: Used for displaying audio waveform animation

These streams were stopped asynchronously without synchronization, causing a race condition where audio could still be captured and sent after the mute button was pressed.

### Root Cause

In `PremiumVoiceInterface.tsx`, the `toggleMute` callback was not awaiting the completion of both stream cleanups:

```typescript
// ❌ BEFORE: Async operations without synchronization
cleanupAudioAnalysis(); // Not awaited
agent.stopMicrophone(); // Could run before cleanup finishes
```

### Solution

**File**: `src/components/chat/PremiumVoiceInterface.tsx`

1. Made `toggleMute` async (line 355)
2. Used `Promise.all()` to stop both streams in parallel and wait for completion (lines 401-410)
3. Added triple-checking in Deepgram client to block audio sending when `isMicrophoneActive` is false

```typescript
// ✅ AFTER: Synchronized stream cleanup
await Promise.all([
  Promise.resolve(cleanupAudioAnalysis()),
  (async () => {
    if (agent instanceof HybridVoiceAgent || agent instanceof DeepgramVoiceAgent) {
      agent.stopMicrophone();
    }
  })()
]);
```

**File**: `src/lib/ai/deepgram.ts`

Added defensive checks to prevent audio chunks from being sent after mute (lines 411-427):

```typescript
// CRITICAL: Check if microphone is active BEFORE processing audio
if (!this.isMicrophoneActive) {
  console.log('[Deepgram] 🔇 Microphone inactive, dropping audio chunk');
  return;
}
```

### Testing

1. Start voice mode
2. Speak into microphone (verify audio is being sent)
3. Click mute button
4. Verify console shows: `✅ Both streams stopped successfully`
5. Verify no more audio chunks are logged after mute
6. Speak into microphone (should see `🔇 Microphone inactive, dropping audio chunk`)

---

## Issue 2: 403 Forbidden When Posting Voice Messages

### Problem

When users accessed an ASK via invite link and tried to post voice messages, the API returned:
```
POST /api/ask/[key] 403 (Forbidden)
Error: "Ce lien d'invitation n'est associé à aucun profil utilisateur"
```

### Root Cause

Participants were being created **without a `user_id`** in the `ask_participants` table when profile creation failed. The API then rejected these participants during invite token authentication because:
- Every invite token MUST be linked to a user profile (`user_id`)
- **No anonymous participants are allowed** in the system
- Messages must always be attributed to a real user for security and accountability

In `/api/admin/asks/route.ts` (lines 217-227):
```typescript
// ❌ BEFORE: Created participants without user_id on error
catch (error) {
  console.error(`Failed to create profile for ${email}:`, error);
  participantRecords.push({
    ask_session_id: data.id,
    participant_email: email, // ❌ No user_id
    role: "participant",
  });
}
```

### Solution

**File**: `src/app/api/ask/[key]/route.ts`

1. **Strict validation of invite tokens** (lines 659-678 for POST, 151-172 for GET):
   - **REJECTS participants without `user_id`** with a clear error message
   - Returns 403 with: "Ce lien d'invitation n'est pas correctement configuré"
   - Logs error details for debugging
   - **No anonymous participants allowed** - this is enforced at both GET and POST

2. **Updated authentication validation** (lines 731-751):
   - Requires `profileId` to be present (from either invite token OR regular auth)
   - Rejects requests without a valid user profile
   - Added detailed logging for debugging

3. **Message payload always includes user_id** (line 911):
   - `user_id` is REQUIRED and never NULL
   - `participant_id` is included for invite token tracking
   - All messages are attributed to a real user profile

**File**: `src/app/api/admin/asks/route.ts`

4. **Prevented creation of orphan participants** (lines 219-234):
   - Do NOT create participants without `user_id`
   - Log failed emails and skip those participants
   - Added warnings when profile creation fails

```typescript
// ✅ AFTER: Skip participants when profile creation fails
catch (error) {
  console.error(`❌ Failed to create profile for ${email}:`, error);
  failedEmails.push(email);
  // Do NOT create participant without user_id
}
```

**File**: `migrations/045_require_user_id_for_participants.sql`

5. **Database enforcement** (new migration):
   - Delete existing orphan participants without `user_id`
   - Make `user_id` NOT NULL in schema
   - Update trigger to verify `user_id` exists
   - Add check constraint for clarity

### Testing

1. Create ASK with participants via email in admin dashboard
2. Verify all participants have `user_id` in database:
   ```sql
   SELECT id, user_id, participant_email, invite_token
   FROM ask_participants
   WHERE ask_session_id = '<ask-id>';
   ```
3. Send invite emails
4. Access ASK via invite link (as anonymous user)
5. Activate voice mode
6. Speak a message
7. Verify message is persisted (no 403 error)
8. Check console logs show:
   ```
   ✅ Valid invite token for participant <id>
   ✅ POST /api/ask/[key]: Authentication validated
   ```

---

## Files Changed

### Core Fixes
- `src/components/chat/PremiumVoiceInterface.tsx` - Synchronized stream cleanup
- `src/lib/ai/deepgram.ts` - Added audio chunk filtering
- `src/app/api/ask/[key]/route.ts` - Support anonymous participants with invite tokens
- `src/app/api/admin/asks/route.ts` - Prevent orphan participant creation

### Database
- `migrations/045_require_user_id_for_participants.sql` - Enforce user_id requirement

### Documentation
- `docs/PARTICIPANT_AUTHENTICATION.md` - Comprehensive guide on participant authentication
- `CHANGELOG_voice_fixes.md` - This file

---

## Migration Guide

### For Existing Deployments

1. **Run the migration**:
   ```bash
   psql $DATABASE_URL -f migrations/045_require_user_id_for_participants.sql
   ```

2. **Verify orphan participants were cleaned**:
   ```sql
   SELECT COUNT(*) FROM ask_participants WHERE user_id IS NULL;
   -- Should return 0
   ```

3. **Re-create affected participants**:
   - Go to admin dashboard
   - Find ASK sessions with missing participants
   - Re-add participants by email
   - System will automatically create profiles with `user_id`

4. **Test invite token authentication**:
   - Send test invite emails
   - Access via invite link
   - Verify voice messages work without 403 errors

### For New Deployments

No special action required. The migration will run as part of initial setup.

---

## Breaking Changes

⚠️ **Database Schema Change**: `ask_participants.user_id` is now NOT NULL

This is a breaking change for any code that:
- Creates participants without `user_id`
- Expects to find participants with NULL `user_id`

**Impact**: Low - The application code already handled this correctly via `ensureProfileExists()`, and orphan participants were non-functional anyway.

⚠️ **No Anonymous Participants**: The system now STRICTLY enforces that all participants must have a `user_id`

- Participants without `user_id` are rejected during authentication (403 error)
- The admin dashboard will NOT create participants if profile creation fails
- All messages must be attributed to a real user profile
- Invite tokens are meaningless without a linked user profile

**Impact**: High for existing deployments with orphan participants - these will be deleted by migration 045.

---

## Future Improvements

1. **UI Feedback**: Show admin which emails failed during participant creation
2. **Retry Logic**: Allow admins to retry failed participant creation
3. **Bulk Import**: Support CSV import with better error reporting
4. **Email Validation**: Pre-validate emails before attempting profile creation

---

## Related Issues

- Microphone stream synchronization
- Invite token authentication
- Anonymous participant support
- Voice message persistence

## Contributors

- Claude (AI Assistant)
- User (pmboutet)
