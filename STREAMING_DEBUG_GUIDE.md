# Streaming Endpoint Debug Guide

## Problem
The streaming endpoint `/api/ask/123/stream` returns a 500 Internal Server Error when trying to send a message.

## Root Cause
The error is likely caused by missing AI model configuration in the database. The streaming endpoint requires:
1. AI model configurations (`ai_model_configs` table)
2. AI agents (`ai_agents` table) 
3. A valid ASK session with key "123"

## Solution Steps

### 1. Check Current State
Run the diagnostic script to see what's missing:

```bash
node scripts/debug-streaming.js
```

### 2. Create Missing Data

#### Create AI Configuration
```bash
node scripts/create-ai-config.js
```

#### Create Test ASK Session
```bash
node scripts/create-test-ask.js
```

### 3. Environment Variables Required

Make sure these environment variables are set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=sk-ant-... (for AI responses)
```

### 4. Database Tables Required

The following tables must exist and have data:

- `ai_model_configs` - AI model configurations
- `ai_agents` - AI agent definitions
- `ask_sessions` - ASK session with key "123"
- `ask_participants` - Participants for the ASK session
- `messages` - Messages in the conversation

### 5. Test the Fix

After running the setup scripts, test the streaming endpoint:

```bash
curl -X POST https://your-app.vercel.app/api/ask/123/stream \
  -H "Content-Type: application/json" \
  -d '{"content": "Hello, this is a test message"}'
```

## Error Messages

### "AI configuration not found"
- Run: `node scripts/create-ai-config.js`

### "ASK introuvable pour la clé fournie"
- Run: `node scripts/create-test-ask.js`

### "Missing API key for model"
- Set the `ANTHROPIC_API_KEY` environment variable

## Files Modified

1. `src/app/api/ask/[key]/stream/route.ts` - Added better error handling
2. `scripts/create-ai-config.js` - Creates AI configuration
3. `scripts/create-test-ask.js` - Creates test ASK session
4. `scripts/debug-streaming.js` - Diagnostic script

## Next Steps

1. Run the diagnostic script to identify missing components
2. Run the appropriate setup scripts
3. Test the streaming endpoint
4. If still failing, check the server logs for specific error messages
