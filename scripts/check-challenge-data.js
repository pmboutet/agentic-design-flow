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

async function checkChallenge() {
  const challengeId = '6e5f8448-7ce2-4857-9c5e-81e5a3ca787f';
  
  console.log('🔍 Checking challenge:', challengeId, '\n');

  // Get challenge
  const { data: challenge, error: challengeError } = await supabase
    .from('challenges')
    .select('*')
    .eq('id', challengeId)
    .single();

  if (challengeError) {
    console.error('❌ Error fetching challenge:', challengeError);
    return;
  }

  console.log('✅ Challenge found:', challenge.name);
  console.log('   Status:', challenge.status);
  console.log('   Priority:', challenge.priority);
  console.log('\n');

  // Get linked insights via challenge_insights
  const { data: links, error: linkError } = await supabase
    .from('challenge_insights')
    .select('insight_id')
    .eq('challenge_id', challengeId);

  if (linkError) {
    console.error('❌ Error fetching links:', linkError);
  } else {
    console.log(`✅ Linked insights via challenge_insights: ${links?.length || 0}`);
    if (links) {
      links.forEach(link => console.log(`   - ${link.insight_id}`));
    }
  }

  console.log('\n');

  // Get foundation insights
  const { data: foundation, error: foundationError } = await supabase
    .from('challenge_foundation_insights')
    .select('insight_id, priority, reason')
    .eq('challenge_id', challengeId);

  if (foundationError) {
    console.error('❌ Error fetching foundation insights:', foundationError);
  } else {
    console.log(`✅ Foundation insights: ${foundation?.length || 0}`);
    if (foundation) {
      foundation.forEach(fi => console.log(`   - ${fi.insight_id} (${fi.priority})`));
    }
  }

  console.log('\n🎯 The challenge should display these 3 insights in the "Foundational insights" section.');
  console.log('   Make sure to select the challenge in the UI to see them.');
}

checkChallenge().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

