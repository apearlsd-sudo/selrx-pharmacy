#!/usr/bin/env python3
"""Replace the commented-out block (lines 1295-1713) in inventory-view.tsx
with the proper Adjust Product dialog content including batch management UI."""

FILE = '/home/z/my-project/src/components/gazpharm/views/inventory-view.tsx'

with open(FILE, 'r') as f:
    lines = f.readlines()

# Find line 1295 (0-indexed: 1294) - the comment line
# Find line 1714 (0-indexed: 1713) - the first active closing tag after the comment block
START = 1294  # 0-indexed
END = 1713    # 0-indexed (exclusive)

# Verify
assert 'batch section temporarily commented' in lines[START], f"Line {START+1}: {lines[START].strip()}"
assert '</div>' in lines[END], f"Line {END+1}: {lines[END].strip()}"

print(f"Replacing lines {START+1} to {END} ({END - START} lines)")

NEW_CONTENT = """{/* ── Quick Stock Adjustment ── */}
              <div className="border rounded-lg p-3 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Edit className="h-3.5 w-3.5" />
                  Quick Stock Adjustment
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Adjustment Type</Label>
                    <Select value={adjustType} onValueChange={setAdjustType}>
                      <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SET">Set Quantity</SelectItem>
                        <SelectItem value="ADD">Add Stock</SelectItem>
                        <SelectItem value="REMOVE">Remove Stock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Quantity</Label>
                    <Input type="number" min="0" placeholder={adjustType === 'SET' ? 'New total' : 'Units'} value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="h-8 text-sm mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-xs">Cost Price</Label>
                    <Input type="number" step="0.01" min="0" placeholder="Leave blank to keep" value={adjustCostPrice} onChange={(e) => setAdjustCostPrice(e.target.value)} className="h-8 text-sm mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-xs">Selling Price</Label>
                    <Input type="number" step="0.01" min="0" placeholder="Leave blank to keep" value={adjustSellingPrice} onChange={(e) => setAdjustSellingPrice(e.target.value)} className="h-8 text-sm mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-xs">Expiry Date</Label>
                    <Input type="date" value={adjustExpiryDate} onChange={(e) => setAdjustExpiryDate(e.target.value)} className="h-8 text-sm mt-0.5" />
                  </div>
                  <div>
                    <Label className="text-xs">Reason <span className="text-red-500">*</span></Label>
                    <Input placeholder="e.g., Restocked, Damaged" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} className="h-8 text-sm mt-0.5" />
                  </div>
                </div>
                <Button size="sm" onClick={handleAdjust} disabled={(!adjustAmount && !adjustCostPrice && !adjustSellingPrice && !adjustExpiryDate) || !adjustReason} className="w-full">
                  Apply Adjustment
                </Button>
              </div>

              {/* ── Batch / Lot Management ── */}
              <div className="border rounded-lg p-3 space-y-3">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Stock Batches (Lots)
                </h4>
                <p className="text-xs text-muted-foreground">
                  Each batch has its own expiry date and cost. Sales automatically consume the earliest-expiring batch first (FEFO).
                </p>

                {/* Existing batches table */}
                {batchesLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : batches.length > 0 ? (
                  <div className="border rounded max-h-48 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium">Batch #</th>
                          <th className="px-2 py-1.5 text-center font-medium">Qty</th>
                          <th className="px-2 py-1.5 text-left font-medium">Expiry</th>
                          <th className="px-2 py-1.5 text-right font-medium">Cost</th>
                          <th className="px-2 py-1.5 text-center font-medium w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {batches.map((b: any) => {
                          const days = b.expiryDate ? getDaysToExpiry(b.expiryDate) : null
                          return (
                            <tr key={b.id} className="hover:bg-muted/30">
                              <td className="px-2 py-1.5 font-medium">{b.batchNumber || '\u2014'}</td>
                              <td className="px-2 py-1.5 text-center font-mono">{b.quantity}</td>
                              <td className="px-2 py-1.5">
                                {b.expiryDate ? (
                                  <span className={days !== null && days <= 90 ? (days <= 0 ? 'text-red-600 font-semibold' : 'text-amber-600') : ''}>
                                    {formatDate(b.expiryDate)}
                                    {days !== null && days <= 90 && (
                                      <Badge variant={days <= 0 ? 'destructive' : 'secondary'} className="ml-1 text-[10px] px-1 py-0">
                                        {days <= 0 ? 'Expired' : `${days}d`}
                                      </Badge>
                                    )}
                                  </span>
                                ) : '\u2014'}
                              </td>
                              <td className="px-2 py-1.5 text-right">{b.costPrice != null ? formatCurrency(b.costPrice) : '\u2014'}</td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  onClick={() => handleDeleteBatch(b.id)}
                                  disabled={savingBatch}
                                  className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                                  title="Remove batch"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-3">No batches recorded for this product yet.</p>
                )}

                {/* Receive new batch form */}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Receive New Stock as Batch</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[11px]">Quantity <span className="text-red-500">*</span></Label>
                      <Input type="number" min="1" placeholder="e.g., 100" value={newBatchQty} onChange={(e) => setNewBatchQty(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Batch Number</Label>
                      <Input placeholder="e.g., BN-2026-001" value={newBatchNumber} onChange={(e) => setNewBatchNumber(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Expiry Date</Label>
                      <Input type="date" value={newBatchExpiry} onChange={(e) => setNewBatchExpiry(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[11px]">Cost Price</Label>
                      <Input type="number" step="0.01" min="0" placeholder="e.g., 5.00" value={newBatchCost} onChange={(e) => setNewBatchCost(e.target.value)} className="h-7 text-xs mt-0.5" />
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={handleReceiveBatch} disabled={!newBatchQty || Number(newBatchQty) <= 0 || savingBatch} className="w-full text-xs">
                    {savingBatch ? 'Receiving...' : `Receive ${newBatchQty || '0'} Units as New Batch`}
                  </Button>
                </div>
              </div>
"""

new_lines = lines[:START] + [NEW_CONTENT + '\n'] + lines[END:]

with open(FILE, 'w') as f:
    f.writelines(new_lines)

print(f"Done! Replaced {END - START} lines with {len(NEW_CONTENT.splitlines())} lines of new content.")
