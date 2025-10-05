const fs = require('fs');
const path = require('path');

console.log('🧹 Cleaning up debug logs...');

// Files to clean up
const filesToClean = [
  'src/lib/ai/providers.ts',
  'src/lib/ai/agent-config.ts'
];

filesToClean.forEach(filePath => {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Remove debug logs from resolveApiKey function
    if (filePath.includes('providers.ts')) {
      content = content.replace(
        /console\.log\('Resolving API key for config:', \{[^}]+\}\);[\s\S]*?console\.log\('API key lookup result:', \{[^}]+\}\);[\s\S]*?console\.log\('Key prefix: ' \+ key\.substring\(0, 10\) \+ '\.\.\.' : 'undefined'\)\n\s+\}\);[\s\S]*?\n\s+const key = process\.env\[config\.apiKeyEnvVar\];/,
        'const key = process.env[config.apiKeyEnvVar];'
      );
    }
    
    // Remove debug logs from getDefaultModelConfig function
    if (filePath.includes('agent-config.ts')) {
      content = content.replace(
        /console\.log\('Fetching default model config from database\.\.\.'\);[\s\S]*?console\.log\('Loaded default model config from database:', \{[^}]+\}\);[\s\S]*?\n\s+return data;/,
        'return data;'
      );
    }
    
    fs.writeFileSync(fullPath, content);
    console.log(`✅ Cleaned up debug logs in ${filePath}`);
    
  } catch (error) {
    console.error(`❌ Error cleaning up ${filePath}:`, error.message);
  }
});

console.log('🎉 Debug logs cleanup completed!');
