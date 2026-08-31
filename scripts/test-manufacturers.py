#!/usr/bin/env python3
"""End-to-end test for the Manufacturer feature."""

import json
import urllib.request
import urllib.error

BASE = "http://localhost:3000"
ADMIN_ID = "cms1im8ac0000sla8s1tsqz4k"
ADMIN_ROLE = "SUPER_ADMIN"


def req(path, method="GET", body=None, headers=None):
    h = {"x-user-id": ADMIN_ID, "x-user-role": ADMIN_ROLE}
    if headers:
        h.update(headers)
    if body is not None:
        h["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    else:
        data = None
    r = urllib.request.Request(f"{BASE}{path}", method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode())


def expect(label, actual, expected):
    ok = actual == expected
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}: got {actual!r}, expected {expected!r}")
    return ok


print("=== Test 1: GET /api/manufacturers on empty DB ===")
status, data = req("/api/manufacturers")
expect("status 200", status, 200)
expect("returns a list", isinstance(data, list), True)
print(f"  initial manufacturer count: {len(data)}")
print()

print("=== Test 2: Create a manufacturer (POST) ===")
status, mfr1 = req("/api/manufacturers", "POST", {
    "name": "GSK Test",
    "country": "USA",
    "contactPerson": "John Doe",
    "email": "john@gsktest.com",
    "phone": "+1-555-000-1234",
})
expect("status 201", status, 201)
expect("name matches", mfr1.get("name"), "GSK Test")
expect("country matches", mfr1.get("country"), "USA")
mfr1_id = mfr1["id"]
print()

print("=== Test 3: Duplicate name (case-insensitive) should 409 ===")
status, err = req("/api/manufacturers", "POST", {"name": "gsk test"})
expect("status 409", status, 409)
expect("error mentions duplicate", "already exists" in err.get("error", "").lower(), True)
print()

print("=== Test 4: Create a second manufacturer ===")
status, mfr2 = req("/api/manufacturers", "POST", {"name": "Pfizer Test", "country": "Germany"})
expect("status 201", status, 201)
mfr2_id = mfr2["id"]
print()

print("=== Test 5: GET list now has both manufacturers ===")
status, data = req("/api/manufacturers")
expect("status 200", status, 200)
expect("count = 2", len(data), 2)
# Verify alphabetical sort
names = [m["name"] for m in data]
expect("alphabetical order", names, sorted(names))
print()

print("=== Test 6: Create a product linked to a manufacturer ===")
status, prod = req("/api/products", "POST", {
    "name": "Test Drug Mfr E2E",
    "category": "OTC",
    "dosageForm": "Tablet",
    "manufacturer": "GSK Test",
    "sellingPrice": 9.99,
    "initialStock": 5,
})
expect("status 201", status, 201)
expect("product.manufacturer saved", prod.get("manufacturer"), "GSK Test")
prod_id = prod["id"]
print()

print("=== Test 7: GET /api/products now includes vendor relation (even if null) ===")
import urllib.parse
status, data = req(f"/api/products?search={urllib.parse.quote('Test Drug Mfr E2E')}")
products = data.get("products", data if isinstance(data, list) else [])
expect("found 1 product", len(products), 1)
p = products[0]
expect("manufacturer on product", p.get("manufacturer"), "GSK Test")
# vendor field should be present (null for this product since we didn't set it)
expect("vendor key present", "vendor" in p, True)
print()

print("=== Test 8: Manufacturer productCount reflects the linkage ===")
status, data = req("/api/manufacturers")
gsk = [m for m in data if m["name"] == "GSK Test"][0]
expect("GSK productCount = 1", gsk.get("productCount"), 1)
print()

print("=== Test 9: DELETE a manufacturer — should NOT block even if products link it ===")
status, body = req(f"/api/manufacturers/{mfr1_id}", "DELETE")
expect("status 200", status, 200)
expect("success=true", body.get("success"), True)
expect("affectedProducts = 1", body.get("affectedProducts"), 1)
expect("warning present", body.get("warning") is not None, True)
print()

print("=== Test 10: Product still has the manufacturer text after deletion ===")
status, data = req(f"/api/products?search={urllib.parse.quote('Test Drug Mfr E2E')}")
products = data.get("products", data if isinstance(data, list) else [])
p = products[0]
expect("manufacturer text preserved", p.get("manufacturer"), "GSK Test")
print()

print("=== Test 11: POST with missing name should 400 ===")
status, err = req("/api/manufacturers", "POST", {"country": "USA"})
expect("status 400", status, 400)
print()

print("=== Test 12: CLERK role cannot create manufacturer (403) ===")
status, err = req("/api/manufacturers", "POST", {"name": "Should Fail"}, headers={
    "x-user-id": "cms1lyxlo0008slo4zl5ty17g", "x-user-role": "CLERK"
})
expect("status 403", status, 403)
print()

print("=== Cleanup ===")
# Delete the test product
req(f"/api/products/{prod_id}", "DELETE")
# Delete the second test manufacturer
req(f"/api/manufacturers/{mfr2_id}", "DELETE")
status, data = req("/api/manufacturers")
print(f"  manufacturers remaining: {len(data)} (expected 0)")
print()

print("=== ALL TESTS COMPLETED ===")
