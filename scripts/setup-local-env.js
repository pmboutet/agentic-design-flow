const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up local environment...');

// Check if .env.local already exists
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env.local already exists. Please configure it manually with your actual values.');
  console.log('Required variables:');
  console.log('- NEXT_PUBLIC_SUPABASE_URL');
  console.log('- SUPABASE_SERVICE_ROLE_KEY');
  console.log('- ANTHROPIC_API_KEY');
  return;
}

// Create .env.local template
const envTemplate = `# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# AI Provider Keys
ANTHROPIC_API_KEY=sk-ant-your-anthropic-api-key-here

# Optional: Other AI providers
MISTRAL_API_KEY=sk-mistral-your-mistral-api-key-here
`;

try {
  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ Created .env.local template');
  console.log('');
  console.log('📝 Please edit .env.local and add your actual values:');
  console.log('1. Get your Supabase URL and service key from your Supabase dashboard');
  console.log('2. Get your Anthropic API key from https://console.anthropic.com/');
  console.log('3. Replace the placeholder values in .env.local');
  console.log('');
  console.log('Then run: node scripts/debug-model-config.js');
} catch (error) {
  console.error('❌ Error creating .env.local:', error.message);
}
