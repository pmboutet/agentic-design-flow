const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lsqiqrxxzhgikhvkgpbh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcWlxcnh4emhnaWtodmtncGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjYzMTU2OSwiZXhwIjoyMDU4MjA3NTY5fQ.KcslAuIRjxN7U57zhxVzuV_L81UwxGigp86HOjHvcc0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('Running migration 006: Adding parent_challenge_id column...');
  
  try {
    // Add parent_challenge_id column
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.challenges 
        ADD COLUMN IF NOT EXISTS parent_challenge_id UUID REFERENCES public.challenges(id) ON DELETE SET NULL;
      `
    });
    
    if (alterError) {
      console.error('Error adding parent_challenge_id column:', alterError);
      return;
    }
    
    // Add index
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE INDEX IF NOT EXISTS idx_challenges_parent_challenge_id 
        ON public.challenges(parent_challenge_id);
      `
    });
    
    if (indexError) {
      console.error('Error creating index:', indexError);
      return;
    }
    
    // Add system_prompt column
    const { error: systemPromptError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE public.challenges 
        ADD COLUMN IF NOT EXISTS system_prompt TEXT;
      `
    });
    
    if (systemPromptError) {
      console.error('Error adding system_prompt column:', systemPromptError);
      return;
    }
    
    console.log('Migration 006 completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

runMigration();
