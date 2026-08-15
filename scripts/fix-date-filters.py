"""Fix date filters across all API routes to use date() comparison instead of timezone-unsafe new Date().toISOString()"""

import re

def fix_turso_date_filter(content, date_col='t."createdAt"'):
    """Replace timezone-unsafe Turso date comparisons with date() function."""
    # Pattern: if (effectiveFrom) { ... args.push(new Date(effectiveFrom).toISOString()) }
    content = re.sub(
        r'if \((\w+)\) \{\n\s+conditions\.push\(`.+?>= \?`\)\n\s+args\.push\(new Date\(\1\)\.toISOString\(\)\)\n\s+\}',
        f'if (\\1) {{\\n        conditions.push(`date({date_col}) >= ?`)\\n        args.push(\\1)\\n      }}',
        content
    )
    # Pattern: if (effectiveTo) { const toDate = new Date(effectiveTo) ... args.push(toDate.toISOString()) }
    content = re.sub(
        r'if \((\w+)\) \{\n\s+const toDate = new Date\(\1\)\n\s+toDate\.setHours\(23, 59, 59, 999\)\n\s+conditions\.push\(`.+?<= \?`\)\n\s+args\.push\(toDate\.toISOString\(\)\)\n\s+\}',
        f'if (\\1) {{\\n        conditions.push(`date({date_col}) <= ?`)\\n        args.push(\\1)\\n      }}',
        content
    )
    return content


def fix_prisma_date_filter(content):
    """Replace timezone-unsafe Prisma date comparisons."""
    # Pattern 1: dateFilter.gte = new Date(effectiveFrom)
    content = re.sub(
        r"if \((\w+)\) dateFilter\.gte = new Date\(\1\)",
        r'if (\1) dateFilter.gte = new Date(\1 + \'T00:00:00\')',
        content
    )
    # Pattern 2: if (effectiveTo) { const toDate = new Date(effectiveTo) ... toDate.setHours... }
    content = re.sub(
        r'if \((\w+)\) \{\n\s+const toDate = new Date\(\1\)\n\s+toDate\.setHours\(23, 59, 59, 999\)\n\s+dateFilter\.lte = toDate\n\s+\}',
        r"if (\1) dateFilter.lte = new Date(\1 + 'T23:59:59')",
        content
    )
    return content


# Fix sales-history
print('Fixing sales-history...')
with open('/home/z/my-project/src/app/api/sales-history/route.ts', 'r') as f:
    c = f.read()
before = c
c = fix_turso_date_filter(c, 't."createdAt"')
c = fix_prisma_date_filter(c)
if c != before:
    with open('/home/z/my-project/src/app/api/sales-history/route.ts', 'w') as f:
        f.write(c)
    print('  OK')
else:
    print('  NO CHANGES')

# Fix audit-logs
print('Fixing audit-logs...')
with open('/home/z/my-project/src/app/api/audit-logs/route.ts', 'r') as f:
    c = f.read()
before = c
c = fix_turso_date_filter(c, 'al."createdAt"')
c = fix_prisma_date_filter(c)
if c != before:
    with open('/home/z/my-project/src/app/api/audit-logs/route.ts', 'w') as f:
        f.write(c)
    print('  OK')
else:
    print('  NO CHANGES')

# Fix login-history
print('Fixing login-history...')
with open('/home/z/my-project/src/app/api/login-history/route.ts', 'r') as f:
    c = f.read()
before = c
# login-history uses startDate/endDate variable names
c = re.sub(
    r'if \(startDate\) \{\n\s+conditions\.push\(`.+?>= \?`\)\n\s+args\.push\(new Date\(startDate \+ \'T00:00:00\'\)\.toISOString\(\)\)\n\s+\}',
    'if (startDate) {\\n        conditions.push(`date(lh."createdAt") >= ?`)\\n        args.push(startDate)\\n      }',
    c
)
c = re.sub(
    r'if \(endDate\) \{\n\s+conditions\.push\(`.+?<= \?`\)\n\s+args\.push\(new Date\(endDate \+ \'T23:59:59\'\)\.toISOString\(\)\)\n\s+\}',
    'if (endDate) {\\n        conditions.push(`date(lh."createdAt") <= ?`)\\n        args.push(endDate)\\n      }',
    c
)
c = fix_prisma_date_filter(c)
if c != before:
    with open('/home/z/my-project/src/app/api/login-history/route.ts', 'w') as f:
        f.write(c)
    print('  OK')
else:
    print('  NO CHANGES')

# Fix product-sales-analytics
print('Fixing product-sales-analytics...')
with open('/home/z/my-project/src/app/api/product-sales-analytics/route.ts', 'r') as f:
    c = f.read()
before = c
c = fix_turso_date_filter(c, 't."createdAt"')
c = fix_prisma_date_filter(c)
if c != before:
    with open('/home/z/my-project/src/app/api/product-sales-analytics/route.ts', 'w') as f:
        f.write(c)
    print('  OK')
else:
    print('  NO CHANGES')

print('Done!')
