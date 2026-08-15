import re

with open('/home/z/my-project/src/components/gazpharm/views/stock-take-section.tsx', 'r') as f:
    content = f.read()

old = '''                                <TableCell className="text-xs">
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="truncate">{inv.product.name}</span>
                                    <div className="flex items-center gap-1">
                                      {hasZeroedExpired && bs?.zeroedExpiryDate && (
                                        <TooltipProvider delayDuration={200}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Info className="h-2.5 w-2.5 text-amber-500 shrink-0 cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs">
                                              <div className="text-xs space-y-1">
                                                <p className="font-medium text-amber-600">Expired stock removed from system</p>
                                                {bs.zeroedTotalQty > 0 && (
                                                  <p>{bs.zeroedTotalQty} unit{bs.zeroedTotalQty !== 1 ? 's' : ''} expired and were removed from the system{bs.lastZeroedAt ? ` on ${formatDateTime(bs.lastZeroedAt)}` : ''}.</p>
                                                )}
                                                {bs.zeroedTotalQty === 0 && (
                                                  <p>{bs.zeroedExpiredBatches} batch{bs.zeroedExpiredBatches! > 1 ? 'es' : ''} expired and were zeroed out automatically{bs.lastZeroedAt ? ` on ${formatDateTime(bs.lastZeroedAt)}` : ''}.</p>
                                                )}
                                                <p>Expired: {formatDateInput(bs.zeroedExpiryDate)}</p>
                                                <p className="text-muted-foreground pt-0.5">Check shelf for remaining expired stock.</p>
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {!hasZeroedExpired && (bs?.expiredBatches ?? 0) > 0 && bs?.nearestExpiredDate && (
                                        <TooltipProvider delayDuration={200}>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Info className="h-2.5 w-2.5 text-amber-500 shrink-0 cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs">
                                              <div className="text-xs space-y-1">
                                                <p className="font-medium text-amber-600">Batch with past expiry date</p>
                                                <p>{bs!.expiredBatches} batch{bs!.expiredBatches! > 1 ? 'es' : ''} has expiry date in the past but still has system stock.</p>
                                                <p>Expired: {formatDateInput(bs!.nearestExpiredDate)}</p>
                                                <p className="text-muted-foreground pt-0.5">Verify if these goods are still on shelf and sellable.</p>
                                              </div>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      {batchBreakdown && (
                                        <span className="text-[10px] text-muted-foreground">
                                          {batchBreakdown}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>'''

new = '''                                <TableCell className="text-xs relative">
                                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                                    <span className="truncate">{inv.product.name}</span>
                                    {batchBreakdown && (
                                      <span className="text-[10px] text-muted-foreground">{batchBreakdown}</span>
                                    )}
                                  </div>
                                  {hasZeroedExpired && bs?.zeroedExpiryDate && (
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="absolute right-1 top-1/2 -translate-y-1/2 cursor-help"><Info className="h-3 w-3 text-amber-500" /></span>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="max-w-xs">
                                          <div className="text-xs space-y-1">
                                            <p className="font-medium text-amber-600">Expired stock removed from system</p>
                                            {bs.zeroedTotalQty > 0 && (
                                              <p>{bs.zeroedTotalQty} unit{bs.zeroedTotalQty !== 1 ? 's' : ''} expired and were removed from the system{bs.lastZeroedAt ? ` on ${formatDateTime(bs.lastZeroedAt)}` : ''}.</p>
                                            )}
                                            {bs.zeroedTotalQty === 0 && (
                                              <p>{bs.zeroedExpiredBatches} batch{bs.zeroedExpiredBatches! > 1 ? 'es' : ''} expired and were zeroed out automatically{bs.lastZeroedAt ? ` on ${formatDateTime(bs.lastZeroedAt)}` : ''}.</p>
                                            )}
                                            <p>Expired: {formatDateInput(bs.zeroedExpiryDate)}</p>
                                            <p className="text-muted-foreground pt-0.5">Check shelf for remaining expired stock.</p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  {!hasZeroedExpired && (bs?.expiredBatches ?? 0) > 0 && bs?.nearestExpiredDate && (
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="absolute right-1 top-1/2 -translate-y-1/2 cursor-help"><Info className="h-3 w-3 text-amber-500" /></span>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="max-w-xs">
                                          <div className="text-xs space-y-1">
                                            <p className="font-medium text-amber-600">Batch with past expiry date</p>
                                            <p>{bs!.expiredBatches} batch{bs!.expiredBatches! > 1 ? 'es' : ''} has expiry date in the past but still has system stock.</p>
                                            <p>Expired: {formatDateInput(bs!.nearestExpiredDate)}</p>
                                            <p className="text-muted-foreground pt-0.5">Verify if these goods are still on shelf and sellable.</p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                </TableCell>'''

if old in content:
    content = content.replace(old, new)
    with open('/home/z/my-project/src/components/gazpharm/views/stock-take-section.tsx', 'w') as f:
        f.write(content)
    print('SUCCESS: Replaced tooltip section')
else:
    print('ERROR: Old string not found. Dumping lines 583-633 for debug:')
    lines = content.split('\n')
    for i, line in enumerate(lines[582:633], start=583):
        print(f'{i}: {repr(line)}')
