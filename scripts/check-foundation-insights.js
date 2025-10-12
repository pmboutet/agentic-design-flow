#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkFoundationInsights() {
  console.log('🔍 Checking foundation insights in database...\n');

  // Check challenge_foundation_insights table
  const { data: foundationInsights, error: foundationError } = await supabase
    .from('challenge_foundation_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (foundationError) {
    console.error('❌ Error fetching foundation insights:', foundationError);
  } else {
    console.log(`✅ Foundation Insights in challenge_foundation_insights: ${foundationInsights?.length || 0}`);
    if (foundationInsights && foundationInsights.length > 0) {
      foundationInsights.forEach(fi => {
        console.log(`   - Challenge: ${fi.challenge_id}, Insight: ${fi.insight_id}, Priority: ${fi.priority}`);
      });
    }
  }

  console.log('\n');

  // Check challenge_insights table
  const { data: challengeInsights, error: challengeError } = await supabase
    .from('challenge_insights')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (challengeError) {
    console.error('❌ Error fetching challenge insights:', challengeError);
  } else {
    console.log(`✅ Links in challenge_insights: ${challengeInsights?.length || 0}`);
    if (challengeInsights && challengeInsights.length > 0) {
      challengeInsights.forEach(ci => {
        console.log(`   - Challenge: ${ci.challenge_id}, Insight: ${ci.insight_id}`);
      });
    }
  }

  console.log('\n');

  // Check if insights exist
  if (foundationInsights && foundationInsights.length > 0) {
    const insightIds = foundationInsights.map(fi => fi.insight_id);
    const { data: insights, error: insightError } = await supabase
      .from('insights')
      .select('id, content, summary, ask_session_id')
      .in('id', insightIds);

    if (insightError) {
      console.error('❌ Error fetching insights:', insightError);
    } else {
      console.log(`✅ Insights found: ${insights?.length || 0}`);
      if (insights && insights.length > 0) {
        insights.forEach(insight => {
          const summary = insight.summary || insight.content?.substring(0, 50) || 'No content';
          console.log(`   - ${insight.id}: ${summary}... (ASK: ${insight.ask_session_id || 'NULL'})`);
        });
      }
    }
  }

  console.log('\n🎯 Summary:');
  console.log(`   Foundation Insights metadata: ${foundationInsights?.length || 0}`);
  console.log(`   Challenge-Insight links: ${challengeInsights?.length || 0}`);
  console.log('\n💡 If insights have ask_session_id = NULL, they should be loaded as orphan insights.');
}

checkFoundationInsights().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

