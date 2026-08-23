import re

with open('src/app/api/inventory/route.ts', 'r') as f:
    content = f.read()

# Build pattern carefully
start_marker = '      // '
# Find the line with AUTO-EXPIRY
lines = content.split('\n')
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if 'AUTO-EXPIRY: Zero out any batches' in line and start_idx is None:
        start_idx = i
    if start_idx is not None and i > start_idx and '// 1. Inventory rows' in line:
        end_idx = i
        break

if start_idx is None:
    print('NO CHANGE - start marker not found')
elif end_idx is None:
    print('NO CHANGE - end marker not found')
else:
    new_lines = lines[:start_idx] + [
        '      // AUTO-EXPIRY: Batch-level + product-level (shared)',
        '      await runAutoExpiry()',
        '',
    ] + lines[end_idx:]
    with open('src/app/api/inventory/route.ts', 'w') as f:
        f.write('\n'.join(new_lines))
    print(f'REPLACED lines {start_idx+1}-{end_idx} with 3 lines')
