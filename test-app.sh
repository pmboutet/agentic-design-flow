#!/bin/bash

# Test script for Agentic Design Flow
# Usage: ./test-app.sh https://your-app.vercel.app

if [ -z "$1" ]; then
  echo "Usage: $0 <app-url>"
  echo "Example: $0 https://your-app.vercel.app"
  exit 1
fi

APP_URL="$1"
ASK_KEY="test-$(date +%s)"

echo "🚀 Testing Agentic Design Flow at $APP_URL"
echo "📋 Using ASK key: $ASK_KEY"
echo ""

# Step 1: Create ASK
echo "1️⃣ Creating ASK..."
RESPONSE=$(curl -s -X POST "$APP_URL/api/ask/$ASK_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"askKey\": \"$ASK_KEY\",
    \"question\": \"What challenges do you face in your daily work?\",
    \"endDate\": \"2025-12-31T23:59:59Z\"
  }")

echo "Response: $RESPONSE"
echo ""

# Step 2: Test message endpoint
echo "2️⃣ Sending test message..."
MESSAGE_RESPONSE=$(curl -s -X POST "$APP_URL/api/messages/$ASK_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"askKey\": \"$ASK_KEY\",
    \"content\": \"I struggle with too many meetings and email overload.\",
    \"type\": \"text\"
  }")

echo "Response: $MESSAGE_RESPONSE"
echo ""

# Step 3: Add test challenge
echo "3️⃣ Adding test challenge..."
CHALLENGE_RESPONSE=$(curl -s -X POST "$APP_URL/api/challenges/$ASK_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"askKey\": \"$ASK_KEY\",
    \"action\": \"update\",
    \"challenges\": [
      {
        \"id\": \"challenge-1\",
        \"name\": \"Meeting Efficiency\",
        \"pains\": [
          {
            \"id\": \"pain-1\",
            \"name\": \"Too Many Meetings\",
            \"description\": \"Spending too much time in unproductive meetings\",
            \"kpiEstimations\": [
              {
                \"description\": \"Weekly meeting hours\",
                \"value\": { \"current\": 15, \"target\": 8, \"unit\": \"hours\" }
              }
            ]
          }
        ],
        \"gains\": [
          {
            \"id\": \"gain-1\",
            \"name\": \"More Focus Time\",
            \"description\": \"Reduced meetings = more time for deep work\",
            \"kpiEstimations\": [
              {
                \"description\": \"Productivity increase\",
                \"value\": { \"expected\": 30, \"unit\": \"percent\" }
              }
            ]
          }
        ]
      }
    ]
  }")

echo "Response: $CHALLENGE_RESPONSE"
echo ""

# Step 4: Provide access link
echo "✅ Test complete!"
echo "🔗 Access your test session at:"
echo "$APP_URL/?key=$ASK_KEY"
echo ""
echo "📊 You should see:"
echo "- The question in the chat"
echo "- Your test message"
echo "- The challenge with pain/gain structure"
