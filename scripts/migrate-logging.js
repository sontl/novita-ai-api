#!/usr/bin/env node

/**
 * Script to help migrate logging calls to use axiomSafeLogger
 * This will find all logger.info/warn/error calls and suggest replacements
 */

const fs = require('fs');
const path = require('path');

function findLoggerCalls(dir) {
  const files = fs.readdirSync(dir);
  const results = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      results.push(...findLoggerCalls(filePath));
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check if file uses logger from utils/logger
      if (content.includes("import { logger } from '../utils/logger'") ||
          content.includes("import { logger } from '../../utils/logger'") ||
          content.includes("import { logger } from './utils/logger'")) {
        
        // Find logger calls with dynamic fields
        const loggerCallRegex = /logger\.(info|warn|error|debug)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*\{([^}]+)\}/g;
        let match;
        
        while ((match = loggerCallRegex.exec(content)) !== null) {
          const [fullMatch, level, message, fields] = match;
          
          // Check if fields contain dynamic properties that could cause column limit issues
          const dynamicFields = [
            'jobId', 'instanceName', 'operationId', 'scheduledAt', 'lastUsedAt',
            'inactivityThresholdMinutes', 'dryRun', 'eligibleCount', 'lastUsedTime',
            'inactiveMinutes', 'successRate', 'processingTimeMs', 'attempts',
            'type', 'queueSize', 'novitaInstanceId', 'templateId', 'templateName'
          ];
          
          const hasDynamicFields = dynamicFields.some(field => fields.includes(field));
          
          if (hasDynamicFields) {
            results.push({
              file: filePath,
              line: content.substring(0, match.index).split('\n').length,
              level,
              message,
              fields: fields.trim(),
              fullMatch
            });
          }
        }
      }
    }
  }

  return results;
}

console.log('🔍 Scanning for logger calls that need migration...\n');

const srcDir = path.join(__dirname, '..', 'src');
const loggerCalls = findLoggerCalls(srcDir);

if (loggerCalls.length === 0) {
  console.log('✅ No problematic logger calls found!');
} else {
  console.log(`⚠️  Found ${loggerCalls.length} logger calls that may cause Axiom column limit issues:\n`);
  
  loggerCalls.forEach((call, index) => {
    console.log(`${index + 1}. ${call.file}:${call.line}`);
    console.log(`   logger.${call.level}('${call.message}', { ${call.fields} })`);
    console.log('');
  });
  
  console.log('\n📝 To fix these issues:');
  console.log('1. Replace logger import with: import { createAxiomSafeLogger } from "../utils/axiomSafeLogger"');
  console.log('2. Create logger instance: const logger = createAxiomSafeLogger("component-name")');
  console.log('3. Add "operation" field to identify the type of operation');
  console.log('4. Dynamic fields will automatically go into metadata');
}