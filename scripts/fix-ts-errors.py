#!/usr/bin/env python3
"""Auto-fix common TypeScript errors in the project."""

import re
import os
import sys

BASE = '/home/z/my-project/src'

def read_file(path):
    with open(path, 'r') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w') as f:
        f.write(content)

def fix_file(path):
    """Apply all fixes to a single file."""
    try:
        content = read_file(path)
    except:
        return 0
    
    original = content
    fixes = 0
    
    # Fix 1: Replace local toObjs with import from turso
    # Pattern: function toObjs(result: {...})
    if 'function toObjs' in content and 'import { toObjs' not in content and 'from' not in content.split('function toObjs')[0][-500:]:
        # Remove local toObjs function definition
        # Find the function start and end
        pattern = r'function toObjs\([^)]*\)\s*\{[^}]*\}\s*'
        match = re.search(pattern, content)
        if match:
            content = content[:match.start()] + content[match.end():]
            fixes += 1
        
        # Add import if not already imported from turso
        if 'from' in content and '@/lib/turso' in content:
            # Add toObjs to existing import
            content = re.sub(
                r'(import\s*\{[^}]*?)\}\s*from\s*[\'\"]@/lib/turso[\'\"]\)',
                r'\1, toObjs } from "@/lib/turso"',
                content
            )
        elif 'turso' in content and '@/lib/turso' not in content:
            # Find a good place to add import
            first_import = content.find('import ')
            if first_import >= 0:
                # Find end of first import line
                end = content.find('\n', first_import)
                content = content[:end] + '\nimport { toObjs } from "@/lib/turso"' + content[end:]
        else:
            # Add at top after existing imports
            first_import = content.find('import ')
            if first_import >= 0:
                end = content.find('\n', first_import)
                content = content[:end] + '\nimport { toObjs } from "@/lib/turso"' + content[end:]
        fixes += 1
    
    # Fix 2: Replace turso.execute calls that have args with potential undefined
    # Pattern: turso.execute({ sql: '...', args: [ potentially undefined values ]})
    # Wrap with safeArgs
    if 'turso.execute(' in content and 'safeArgs' not in content:
        # Only add safeArgs import if there are execute calls with args arrays
        if re.search(r'turso\.execute\(\s*\{', content):
            # Add safeArgs to turso import
            if 'from' in content and '@/lib/turso' in content:
                content = re.sub(
                    r'(import\s*\{[^}]*?)\}\s*from\s*[\'\"]@/lib/turso[\'\"]\)',
                    lambda m: m.group(1).rstrip() + ', safeArgs } from "@/lib/turso"' if 'safeArgs' not in m.group(0) else m.group(0),
                    content
                )
    
    # Fix 3: Replace `.rows` array destructuring with toObgs where needed
    # This is for cases where code does: result.rows.map(row => ...)
    # These need to be replaced with toObjs(result).map(...)
    
    if content != original:
        write_file(path, content)
        return fixes
    return 0

def main():
    # Find all .ts and .tsx files in src/
    for root, dirs, files in os.walk(BASE):
        for f in files:
            if f.endswith(('.ts', '.tsx')):
                path = os.path.join(root, f)
                n = fix_file(path)
                if n > 0:
                    print(f'  Fixed {n} issues in {path}')

if __name__ == '__main__':
    main()
