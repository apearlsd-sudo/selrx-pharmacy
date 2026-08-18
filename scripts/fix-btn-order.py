import re

with open('/home/z/my-project/src/components/gazpharm/views/master-data-view.tsx', 'r') as f:
    content = f.read()

# Find and replace the product action buttons block
# Pattern: isDiscontinued ternary with delete first, then edit after

old_block = '''{isDiscontinued ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/30 dark:bg-emerald-900/20" onClick={() => handleReactivateDrug(drug)} title="Reactivate">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30 dark:bg-red-900/20" onClick={() => setDeleteDrug(drug)} title="Discontinue">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDrug(drug); setDrugEditOpen(true) }} title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>'''

new_block = '''{isDiscontinued ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/30 dark:bg-emerald-900/20" onClick={() => handleReactivateDrug(drug)} title="Reactivate">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDrug(drug); setDrugEditOpen(true) }} title="Edit">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingDrug(drug); setDrugEditOpen(true) }} title="Edit">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-900/30 dark:hover:bg-red-900/30 dark:bg-red-900/20" onClick={() => setDeleteDrug(drug)} title="Discontinue">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}'''

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    with open('/home/z/my-project/src/components/gazpharm/views/master-data-view.tsx', 'w') as f:
        f.write(content)
    print('OK - buttons reordered')
else:
    print('NOT FOUND - checking for whitespace issues')
    # Try to find the approximate location
    idx = content.find('handleReactivateDrug(drug)')
    if idx >= 0:
        print(f'Found handleReactivateDrug at index {idx}')
    else:
        print('handleReactivateDrug not found either')
