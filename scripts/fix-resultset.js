const fs = require('fs');
const path = require('path');

const BASE = '/home/z/my-project/src';

// Find all local toObjs function definitions
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // 1. Replace local toObjs with import from turso
  const toObjsMatch = content.match(/function\s+toObjs\s*\([^)]*\)\s*\{[^}]*\n\s*\}/s);
  if (toObjsMatch) {
    content = content.replace(toObjsMatch[0], '');
    changed = true;
  }

  // 2. Add toObjs import
  if (changed || content.includes('toObjs(')) {
    // Check if already imported from turso
    if (!content.includes('toObjs') || !content.includes("from '@/lib/turso'")) {
      if (content.includes("from '@/lib/turso'")) {
        // Add to existing import
        content = content.replace(
          /(import\s*\{[^}]*?)\}\s*from\s*['"]@\/lib\/turso['"])/,
          (match, p1) => {
            if (p1.includes('toObjs')) return match;
            return p1 + ', toObjs } from "@/lib/turso"';
          }
        );
      } else {
        // Add new import
        const firstImport = content.indexOf('import ');
        if (firstImport >= 0) {
          const end = content.indexOf('\n', firstImport);
          content = content.slice(0, end) + "\nimport { toObjs } from '@/lib/turso'" + content.slice(end);
        }
      }
      changed = true;
    }
  }

  // 3. Replace `unknown[]` args type with proper cast
  // Pattern: args: unknown[] or args: (string | number | ...)[]
  // These need to be cast as InArgs when passed to turso.execute
  // For turso.execute({sql, args: someArray}):
  //   Replace: args: someArray  →  args: someArray as any  (simplest fix)
  
  // 4. Fix turso.execute({sql, args: ...}) where args is typed as unknown[]
  // by adding 'as any' to the args
  
  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log('  Updated: ' + filePath.replace(BASE + '/', ''));
  }
  return changed;
}

// Process all files that have TS errors
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log('Usage: node fix-resultset.js <file1> <file2> ...');
  process.exit(1);
}

let count = 0;
for (const f of files) {
  if (processFile(f)) count++;
}
console.log(`\nProcessed ${count} files`);
