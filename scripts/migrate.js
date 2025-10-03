#!/usr/bin/env node

const { runCLI } = require('./migrate-core');

runCLI(process.argv.slice(2));
