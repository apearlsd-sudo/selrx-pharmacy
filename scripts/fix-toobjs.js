const fs = require('fs');
const path = require('path');

const files = process.argv.slice(2);
let fixed = 0;

for (const f of files) {
  if (!fs.existsSync(f)) { console.log('SKIP (not found): ' + f); continue; }
  let c = fs.readFileSync(f, 'utf8');
  const orig = c;
  
  // 1. Remove local toObjs function (multi-line)
  c = c.replace(/function\s+toObjs\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/, '');
  
  // 2. Add toObjs to import from @/lib/turso
  if (c.includes("from '@/lib/turso'")) {
    if (!c.includes('toObjs')) {
      c = c.replace(/(import\s*\{[^}]*?)\}\s*from\s*['"]@\/lib\/turso['"]/, '$1, toObjs } from "@/lib/turso"');
    }
  } else {
    // Add new import at top
    const lastImport = c.lastIndexOf('import ');
    const end = c.indexOf('\n', lastImport);
    if (end > 0 && !c.includes('toObjs')) {
      c = c.slice(0, end) + "\nimport { toObjs } from '@/lib/turso'" + c.slice(end);
    }
  }
  
  // 3. Fix args: unknown[] → args: any[]
  c = c.replace(/args:\s*unknown\[\]/g, 'args: any[]');
  
  // 4. Fix other unknown[] that get passed as InArgs
  c = c.replace(/: unknown\[\]/g, ': any[]');
  
  if (c !== orig) {
    fs.writeFileSync(f, c);
    console.log('FIXED: ' + f);
    fixed++;
  } else {
    console.log('NO CHANGE: ' + f);
  }
}

console.log('\nFixed ' + fixed + '/' + files.length + ' files');