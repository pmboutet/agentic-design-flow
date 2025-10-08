const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lsqiqrxxzhgikhvkgpbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcWlxcnh4emhnaWtodmtncGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjYzMTU2OSwiZXhwIjoyMDU4MjA3NTY5fQ.KcslAuIRjxN7U57zhxVzuV_L81UwxGigp86HOjHvcc0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndFixSchema() {
  console.log('Checking challenges table schema...');
  
  try {
    // First, let's check if the column exists by trying to query it
    const { data, error } = await supabase
      .from('challenges')
      .select('id, name, parent_challenge_id')
      .limit(1);
    
    if (error) {
      if (error.code === 'PGRST116' && error.message.includes('parent_challenge_id')) {
        console.log('❌ Column parent_challenge_id does not exist');
        console.log('🔧 You need to add this column manually in Supabase Dashboard');
        console.log('');
        console.log('Please run this SQL in your Supabase SQL Editor:');
        console.log('');
        console.log('-- Add parent_challenge_id column');
        console.log('ALTER TABLE public.challenges ADD COLUMN parent_challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL;');
        console.log('');
        console.log('-- Add index for performance');
        console.log('CREATE INDEX idx_challenges_parent_challenge_id ON public.challenges(parent_challenge_id);');
        console.log('');
        console.log('-- Add system_prompt column');
        console.log('ALTER TABLE public.challenges ADD COLUMN system_prompt TEXT;');
        console.log('');
        console.log('After running this SQL, your application should work correctly.');
      } else {
        console.error('Unexpected error:', error);
      }
    } else {
      console.log('✅ Column parent_challenge_id exists');
      console.log('Schema looks good!');
    }
    
  } catch (error) {
    console.error('Error checking schema:', error);
  }
}

checkAndFixSchema();
