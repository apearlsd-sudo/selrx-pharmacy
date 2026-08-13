import re, os

FILES = [
    "src/app/page.tsx",
    "src/components/gazpharm/sidebar.tsx",
    "src/components/gazpharm/views/sales-history-view.tsx",
    "src/components/gazpharm/views/goods-return-view.tsx",
    "src/components/gazpharm/views/reports-view.tsx",
    "src/components/gazpharm/views/advanced-reports-view.tsx",
    "src/components/gazpharm/views/master-data-view.tsx",
    "src/components/gazpharm/views/other-settings-view.tsx",
    "src/components/gazpharm/views/sync-settings-view.tsx",
    "src/components/gazpharm/views/users-view.tsx",
    "src/components/gazpharm/views/inventory-view.tsx",
    "src/components/gazpharm/shift-report-dialog.tsx",
    "src/components/gazpharm/views/return-ticket-modal.tsx",
    "src/components/gazpharm/views/new-return-dialog.tsx",
    "src/components/gazpharm/views/settings-sections.tsx",
    "src/components/gazpharm/views/settings-hub-view.tsx",
    "src/components/gazpharm/views/pos-view.tsx",
    "src/components/gazpharm/views/dashboard-view.tsx",
    "src/components/gazpharm/views/customers-view.tsx",
    "src/components/gazpharm/views/purchase-orders-view.tsx",
    "src/components/gazpharm/views/login-history-view.tsx",
    "src/components/gazpharm/views/audit-log-view.tsx",
    "src/components/gazpharm/views/stock-take-report-view.tsx",
    "src/components/gazpharm/views/prescriptions-view.tsx",
]

SKIP_BG = [
    'bg-aurora', 'bg-emerald', 'bg-red-', 'bg-amber-', 'bg-blue-', 'bg-violet-',
    'bg-teal-', 'bg-orange-', 'bg-indigo-', 'bg-pink-', 'bg-cyan-', 'bg-lime-',
    'bg-gradient', 'bg-mesh', 'text-gradient', 'receipt', 'bg-rose'
]

def has_colored_bg(line):
    return any(c in line for c in SKIP_BG)

stats = {'files': 0, 'changes': 0}

for fpath in FILES:
    if not os.path.exists(fpath):
        continue
    stats['files'] += 1
    file_changes = 0
    
    with open(fpath, 'r') as f:
        content = f.read()
    
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        orig = line
        
        if has_colored_bg(line):
            new_lines.append(line)
            continue
        
        # bg-white/80
        if 'bg-white/80' in line and 'dark:bg-gray-800/80' not in line:
            line = line.replace('bg-white/80', 'bg-white/80 dark:bg-gray-800/80')
        
        # bg-white (standalone, not part of bg-white/XX, not already having dark:)
        if re.search(r'bg-white(?![/\w])', line) and 'dark:bg-gray-900' not in line:
            line = re.sub(r'bg-white(?![/\w])', 'bg-white dark:bg-gray-900', line)
        
        # text-gray-900
        if 'text-gray-900' in line and 'dark:text-gray-100' not in line:
            line = line.replace('text-gray-900', 'text-gray-900 dark:text-gray-100')
        
        # text-gray-800
        if 'text-gray-800' in line and 'dark:text-gray-200' not in line:
            line = line.replace('text-gray-800', 'text-gray-800 dark:text-gray-200')
        
        # text-gray-700
        if 'text-gray-700' in line and 'dark:text-gray-300' not in line:
            line = line.replace('text-gray-700', 'text-gray-700 dark:text-gray-300')
        
        # focus:bg-white
        if 'focus:bg-white' in line and 'dark:focus:bg-gray-900' not in line:
            line = line.replace('focus:bg-white', 'focus:bg-white dark:focus:bg-gray-900')
        
        # border-gray-100
        if 'border-gray-100' in line and 'dark:border-gray-800' not in line:
            line = line.replace('border-gray-100', 'border-gray-100 dark:border-gray-800')
        
        # border-gray-200
        if 'border-gray-200' in line and 'dark:border-gray-700' not in line:
            line = line.replace('border-gray-200', 'border-gray-200 dark:border-gray-700')
        
        if line != orig:
            file_changes += 1
            stats['changes'] += 1
        
        new_lines.append(line)
    
    if file_changes > 0:
        with open(fpath, 'w') as f:
            f.write('\n'.join(new_lines))
        print(f'  {fpath}: {file_changes} lines changed')

print(f'\nTotal: {stats["files"]} files, {stats["changes"]} lines changed')
