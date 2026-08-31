#!/usr/bin/env python3
"""End-to-end test for the /api/product-sales-analytics endpoint."""

import json
import urllib.request

BASE = "http://localhost:3000"
ADMIN_ID = "cms1im8ac0000sla8s1tsqz4k"
ADMIN_ROLE = "SUPER_ADMIN"
CLERK_ID = "cms1lyxlo0008slo4zl5ty17g"
CLERK_ROLE = "CLERK"
PARACETAMOL_ID = "cms1ivu390007sla85uvbsddj"  # Paracetamol Zenvita 500mg


def fetch(path, user_id=ADMIN_ID, user_role=ADMIN_ROLE):
    req = urllib.request.Request(
        f"{BASE}{path}",
        headers={"x-user-id": user_id, "x-user-role": user_role},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def expect(label, actual, expected):
    ok = actual == expected
    status = "PASS" if ok else "FAIL"
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: got {actual!r}, expected {expected!r}")
    return ok


print("=== Test 1: No filters (default = last 30 days, all users) ===")
d = fetch("/api/product-sales-analytics")
print(f"  summary: {d['summary']}")
print(f"  rows returned: {len(d['rows'])}")
print(f"  scopedToCurrentUser: {d['scopedToCurrentUser']}")
print(f"  allUsers count: {len(d['allUsers'])}")
print()

print("=== Test 2: Filter by product (Paracetamol) ===")
d = fetch(f"/api/product-sales-analytics?productId={PARACETAMOL_ID}")
unique_products = {r["productId"] for r in d["rows"]}
expect("only 1 unique product in rows", len(unique_products), 1)
expect("that product is Paracetamol", PARACETAMOL_ID in unique_products, True)
print(f"  total pieces sold: {d['summary']['totalPiecesSold']}")
print()

print("=== Test 3: Filter by user (Edem, the admin) ===")
d = fetch(f"/api/product-sales-analytics?userId={ADMIN_ID}")
unique_users = {r["userId"] for r in d["rows"]}
expect("only 1 unique user in rows", len(unique_users), 1)
expect("that user is Edem", ADMIN_ID in unique_users, True)
print(f"  total pieces sold by Edem: {d['summary']['totalPiecesSold']}")
print()

print("=== Test 4: Combined filter (Paracetamol + clerk) ===")
d = fetch(f"/api/product-sales-analytics?productId={PARACETAMOL_ID}&userId={CLERK_ID}")
expect("rows is empty (clerk never sold paracetamol)", len(d["rows"]), 0)
expect("totalPiecesSold is 0", d["summary"]["totalPiecesSold"], 0)
print()

print("=== Test 5: Scoped role — CLERK requesting other user's sales ===")
d = fetch(
    f"/api/product-sales-analytics?userId={ADMIN_ID}",
    user_id=CLERK_ID,
    user_role=CLERK_ROLE,
)
expect("scopedToCurrentUser is True", d["scopedToCurrentUser"], True)
expect("filters.userId is clerk (not admin)", d["filters"]["userId"], CLERK_ID)
expect("uniqueUsers is 1", d["summary"]["uniqueUsers"], 1)
unique_users = {r["userId"] for r in d["rows"]}
expect("only clerk's sales in rows", unique_users, {CLERK_ID})
expect("allUsers list is empty (clerk can't pick)", len(d["allUsers"]), 0)
print()

print("=== Test 6: Date range filter (last 1 day) ===")
# Use a very narrow range so we get few/no results
d = fetch("/api/product-sales-analytics?from=2026-07-25T00:00:00Z&to=2026-07-25T23:59:59Z")
print(f"  rows in 2026-07-25: {len(d['rows'])}")
print(f"  filters: {d['filters']}")
print()

print("=== Test 7: Invalid date range (from > to) ===")
try:
    fetch("/api/product-sales-analytics?from=2030-01-01T00:00:00Z&to=2020-01-01T00:00:00Z")
    print("  [FAIL] expected 400 error, got success")
except urllib.error.HTTPError as e:
    body = json.loads(e.read().decode())
    expect("400 status", e.code, 400)
    expect("error message mentions order", "before" in body.get("error", "").lower(), True)
print()

print("=== ALL TESTS COMPLETED ===")
