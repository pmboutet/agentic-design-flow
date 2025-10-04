// Simple test to check if the API key is accessible
console.log('🧪 Simple API key test...');
console.log('Environment variables check:');

// Check for various possible API key environment variable names
const possibleKeys = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_KEY',
  'CLAUDE_API_KEY',
  'CLAUDE_KEY'
];

possibleKeys.forEach(key => {
  const value = process.env[key];
  console.log(`- ${key}: ${value ? 'Set (' + value.length + ' chars)' : 'Not set'}`);
});

// Check all environment variables that might be relevant
console.log('\nAll environment variables containing "API" or "KEY":');
Object.keys(process.env)
  .filter(key => key.includes('API') || key.includes('KEY'))
  .forEach(key => {
    const value = process.env[key];
    console.log(`- ${key}: ${value ? 'Set (' + value.length + ' chars)' : 'Not set'}`);
  });

// Test the specific resolution logic
console.log('\n🔑 Testing API key resolution logic:');
const testConfig = {
  code: 'anthropic-claude-sonnet-4-5',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY'
};

try {
  const key = process.env[testConfig.apiKeyEnvVar];
  if (!key) {
    console.log('❌ API key not found for', testConfig.apiKeyEnvVar);
    console.log('Available environment variables:', Object.keys(process.env).length);
  } else {
    console.log('✅ API key found for', testConfig.apiKeyEnvVar);
    console.log('Key length:', key.length);
    console.log('Key prefix:', key.substring(0, 10) + '...');
  }
} catch (error) {
  console.error('❌ Error testing API key resolution:', error);
}
