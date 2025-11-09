#!/usr/bin/env node

/**
 * Script de validation complète de la configuration voice
 * Combine vérifications DB + APIs + Code
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  console.log('🔍 Validation complète de la configuration voice\n');
  console.log('='.repeat(60));

  const scripts = [
    join(__dirname, 'verify-voice-config-db.js'),
    join(__dirname, 'verify-voice-config-apis.js'),
  ];

  let allPassed = true;

  for (const script of scripts) {
    try {
      console.log(`\n▶️  Exécution de ${script.split('/').pop()}...\n`);
      await runScript(script);
      console.log(`\n✅ ${script.split('/').pop()} terminé avec succès\n`);
    } catch (error) {
      console.error(`\n❌ ${script.split('/').pop()} a échoué:`, error.message);
      allPassed = false;
    }
    console.log('='.repeat(60));
  }

  if (allPassed) {
    console.log('\n✅ Validation complète terminée avec succès');
    process.exit(0);
  } else {
    console.log('\n⚠️  Validation complète terminée avec des erreurs');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});

