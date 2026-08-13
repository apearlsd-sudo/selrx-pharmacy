import re

with open('src/app/globals.css', 'r') as f:
    content = f.read()

# 1. Add dark dot pattern after .bg-dot-pattern block
content = content.replace(
    '.bg-dot-pattern {\n  background-image: radial-gradient(circle, oklch(0.88 0 0) 1px, transparent 1px);\n  background-size: 24px 24px;\n}',
    '.bg-dot-pattern {\n  background-image: radial-gradient(circle, oklch(0.88 0 0) 1px, transparent 1px);\n  background-size: 24px 24px;\n}\n.dark .bg-dot-pattern {\n  background-image: radial-gradient(circle, oklch(0.35 0 0) 1px, transparent 1px);\n}'
)

# 2. Add dark card hover shadow
content = content.replace(
    '  box-shadow: 0 4px 12px rgba(0,0,0,0.08);\n}',
    '  box-shadow: 0 4px 12px rgba(0,0,0,0.08);\n}\n.dark .card-hover:hover {\n  box-shadow: 0 4px 12px rgba(0,0,0,0.3);\n}'
)

# 3. Add dark table header
content = content.replace(
    '.table-header-standard thead tr {\n  background: oklch(0.97 0 0);\n}',
    '.table-header-standard thead tr {\n  background: oklch(0.97 0 0);\n}\n.dark .table-header-standard thead tr {\n  background: oklch(0.25 0 0);\n}'
)

# 4. Add dark table header th color
content = content.replace(
    '  color: oklch(0.45 0 0);\n}',
    '  color: oklch(0.45 0 0);\n}\n.dark .table-header-standard thead th {\n  color: oklch(0.7 0 0);\n}',
    1  # only first occurrence
)

# 5. Add dark dialog scrollbar
content = content.replace(
    '[data-slot="dialog-content"]::-webkit-scrollbar-thumb:hover {\n  background: oklch(0.7 0 0);\n}',
    '[data-slot="dialog-content"]::-webkit-scrollbar-thumb:hover {\n  background: oklch(0.7 0 0);\n}\n.dark [data-slot="dialog-content"]::-webkit-scrollbar-thumb {\n  background: oklch(0.4 0 0);\n}\n.dark [data-slot="dialog-content"]::-webkit-scrollbar-thumb:hover {\n  background: oklch(0.5 0 0);\n}'
)

with open('src/app/globals.css', 'w') as f:
    f.write(content)

print('CSS dark mode rules added successfully')
