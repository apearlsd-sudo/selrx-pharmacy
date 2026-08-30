const fs = require('fs');

const files = process.argv.slice(2);
for (const f of files) {
  let c = fs.readFileSync(f, 'utf8');
  const orig = c;
  
  // Remove leftover toObjs body fragments: 3-4 lines starting with `)`
  // Pattern: after a comment block (// ---) or import, there's orphaned code:
  //   )
  //   return obj
  //   })
  //   }
  c = c.replace(/^(\/\/[- ]*\n)*^(?:\/\/[- ]*\n)*(?:\/\/[- ]*\n)*\n?\)\n\s*return obj\n\s*\}\)\n\}/m, '');
  
  if (c !== orig) {
    fs.writeFileSync(f, c);
    console.log('CLEANED: ' + f);
  } else {
    console.log('OK: ' + f);
  }
}