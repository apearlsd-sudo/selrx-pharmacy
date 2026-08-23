with open('src/app/api/dashboard/route.ts', 'r') as f:
    content = f.read()

lines = content.split('\n')

# Add import after the existing import line
import_idx = None
for i, line in enumerate(lines):
    if "from '@/lib/turso'" in line:
        import_idx = i
        break

if import_idx is not None and "'@/lib/auto-expiry'" not in content:
    lines.insert(import_idx + 1, "import { runAutoExpiry } from '@/lib/auto-expiry'")
    content = '\n'.join(lines)
    print('Added import')

# Find and replace the product-level auto-expiry block
lines = content.split('\n')
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if 'AUTO-EXPIRY' in line and 'Zero inventory' in line and start_idx is None:
        start_idx = i
    if start_idx is not None and i > start_idx:
        # End at the line after the closing of the second turso.execute block
        if line.strip().startswith('const [') or (i > start_idx + 20 and 'Promise.all' in line):
            end_idx = i
            break

if start_idx is not None and end_idx is not None:
    # Find the exact end: the blank line or the start of the parallel queries
    # Go back to find the blank line before the Promise.all
    for j in range(end_idx - 1, start_idx, -1):
        if lines[j].strip() == '':
            end_idx = j
            break
    
    new_lines = lines[:start_idx] + [
        '      // AUTO-EXPIRY: Batch-level + product-level (shared)',
        '      await runAutoExpiry()',
    ] + [''] + lines[end_idx:]
    with open('src/app/api/dashboard/route.ts', 'w') as f:
        f.write('\n'.join(new_lines))
    print(f'Replaced lines {start_idx+1}-{end_idx}')
else:
    print(f'NO CHANGE - start_idx={start_idx}, end_idx={end_idx}')
