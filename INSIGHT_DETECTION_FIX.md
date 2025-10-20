# Insight Detection Fix

## Problem

The `/api/ask/[key]/respond` endpoint was returning `{success: false, error: "Failed to detect insights"}` even though the AI was responding correctly. 

### Root Cause

The insight detection agent (`ask-insight-detection`) had a vague prompt that didn't specify the expected output format:

```
Fournis une réponse structurée avec les insights identifiés.
```

This caused the AI to return a natural language response in French (like a markdown analysis) instead of JSON, which the code expected. The parsing logic in `resolveInsightAgentPayload()` failed to extract JSON from the response and threw an error.

## Solution

Updated the `ask-insight-detection` agent prompt to:

1. **Explicitly specify JSON output format** with no markdown, no backticks, no additional text
2. **Define insight types** (pain, idea, solution, opportunity, risk, feedback, question)
3. **Provide clear structure** for the expected JSON response
4. **Add detailed rules** for creating insights

### New Prompt Structure

The updated prompt now includes:

- **Types of Insights**: Clear categorization (pain, idea, solution, opportunity, risk, feedback, question)
- **Strict Output Format**: JSON-only with specific structure
- **Clear Rules**: 
  - One insight per distinct idea/problem/solution
  - Detailed content (2-4 sentences)
  - Concise summary (one sentence)
  - Proper author attribution
  - Only new insights (not duplicates)

### Expected JSON Format

```json
{
  "insights": [
    {
      "type": "pain|idea|solution|opportunity|risk|feedback|question",
      "content": "Description complète de l'insight (2-4 phrases)",
      "summary": "Résumé court en une phrase",
      "category": "Catégorie optionnelle (ex: onboarding, formation, produit)",
      "priority": "low|medium|high|critical",
      "status": "new",
      "authors": [
        {
          "name": "Nom du participant",
          "userId": null
        }
      ],
      "sourceMessageId": null
    }
  ]
}
```

## Files Modified

1. **`scripts/restore-all-agents.js`**: Updated the `ask-insight-detection` agent definition
2. **`scripts/init-ai-data.js`**: Updated for consistency

## Testing

To test the fix:

1. Navigate to an ASK session with messages
2. Send a message from a participant
3. The AI should respond and automatically detect insights
4. Check the insights panel to verify new insights are detected

Or test directly via API:

```bash
curl -X POST https://agentic-design-flow-pmboutets-projects.vercel.app/api/ask/map-user-onboarding-pain-points-qivy/respond \
  -H "Content-Type: application/json" \
  -d '{}'
```

The response should now include detected insights instead of an error.

## Impact

- ✅ Insight detection now works correctly
- ✅ AI returns structured JSON data
- ✅ Insights are properly categorized by type
- ✅ Better insight extraction from conversations
- ✅ Supports the new variable `latest_ai_response` for better context

## Deployment

The agent has been updated in the database. Changes will take effect immediately for all new insight detection requests.

If you deployed to production, you may need to run the update script on the production database:

```bash
node scripts/restore-all-agents.js
```

