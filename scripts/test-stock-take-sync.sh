#!/usr/bin/env bash
# End-to-end test: verifies that Save Progress and Complete Stock Take
# both update the Inventory table so the POS / dashboard / etc. see fresh
# quantities.

set -euo pipefail

BASE="http://localhost:3000"
# Real user IDs are CUIDs in this DB. Use the SUPER_ADMIN row so the FK
# constraint on StockTake.userId is satisfied.
USER_ID=$(python3 -c "
import sqlite3
conn = sqlite3.connect('/home/z/my-project/db/custom.db')
c = conn.cursor()
c.execute(\"SELECT id FROM User WHERE role='SUPER_ADMIN' LIMIT 1\")
print(c.fetchone()[0])
")
AUTH=(-H "x-user-id: $USER_ID" -H "x-user-role: PHARMACIST")

echo "=== 1. Pick a product and snapshot its current Inventory.quantity ==="
PRODUCT_JSON=$(curl -s "$BASE/api/products?limit=1" "${AUTH[@]}")
PRODUCT_ID=$(echo "$PRODUCT_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["products"][0]["id"])')
PRODUCT_NAME=$(echo "$PRODUCT_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["products"][0]["name"])')
ORIG_QTY=$(echo "$PRODUCT_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["products"][0]["inventory"][0]["quantity"])')

echo "  Product: $PRODUCT_NAME ($PRODUCT_ID)"
echo "  Original Inventory.quantity: $ORIG_QTY"
echo ""

# Decide a new physical count that's clearly different from the original.
NEW_QTY=$((ORIG_QTY + 7))
echo "=== 2. Will count this product as $NEW_QTY (delta +7) ==="
echo ""

echo "=== 3. Start a new stock-take session ==="
SESSION_JSON=$(curl -s -X POST "$BASE/api/stock-take" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"notes": null}')
SESSION_ID=$(echo "$SESSION_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["id"])')
SESSION_NO=$(echo "$SESSION_JSON" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["sessionNo"])')
echo "  Session: $SESSION_NO ($SESSION_ID)"
echo ""

echo "=== 4. Look up the StockTakeItem row for this product ==="
ITEM_ID=$(curl -s "$BASE/api/stock-take/$SESSION_ID" "${AUTH[@]}" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
items = d['items']
match = [i for i in items if i['productId'] == '$PRODUCT_ID']
print(match[0]['id'])")
echo "  StockTakeItem id: $ITEM_ID"
echo ""

echo "=== 5. Save Progress with countedQty=$NEW_QTY ==="
SAVE_RESP=$(curl -s -X PUT "$BASE/api/stock-take/$SESSION_ID" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"save\", \"items\": [{\"id\": \"$ITEM_ID\", \"countedQty\": $NEW_QTY}]}")
echo "  Save response: $SAVE_RESP"
echo ""

echo "=== 6. Verify Inventory.quantity is now $NEW_QTY (Save Progress should have synced) ==="
POST_SAVE_QTY=$(curl -s "$BASE/api/products?search=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PRODUCT_NAME'))")&limit=1" "${AUTH[@]}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["products"][0]["inventory"][0]["quantity"])')
echo "  Inventory.quantity after Save Progress: $POST_SAVE_QTY"
if [ "$POST_SAVE_QTY" = "$NEW_QTY" ]; then
  echo "  ✅ PASS — Save Progress updated Inventory table"
else
  echo "  ❌ FAIL — expected $NEW_QTY, got $POST_SAVE_QTY"
  exit 1
fi
echo ""

echo "=== 7. Change the count to $((NEW_QTY + 3)) and Complete Stock Take ==="
SECOND_NEW_QTY=$((NEW_QTY + 3))
curl -s -X PUT "$BASE/api/stock-take/$SESSION_ID" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"save\", \"items\": [{\"id\": \"$ITEM_ID\", \"countedQty\": $SECOND_NEW_QTY}]}" > /dev/null

COMPLETE_RESP=$(curl -s -X PUT "$BASE/api/stock-take/$SESSION_ID" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"complete\", \"notes\": \"E2E test\"}")
echo "  Complete response: $COMPLETE_RESP"
echo ""

echo "=== 8. Verify Inventory.quantity is now $SECOND_NEW_QTY (Complete should have synced) ==="
POST_COMPLETE_QTY=$(curl -s "$BASE/api/products?search=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PRODUCT_NAME'))")&limit=1" "${AUTH[@]}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["products"][0]["inventory"][0]["quantity"])')
echo "  Inventory.quantity after Complete: $POST_COMPLETE_QTY"
if [ "$POST_COMPLETE_QTY" = "$SECOND_NEW_QTY" ]; then
  echo "  ✅ PASS — Complete Stock Take updated Inventory table"
else
  echo "  ❌ FAIL — expected $SECOND_NEW_QTY, got $POST_COMPLETE_QTY"
  exit 1
fi
echo ""

echo "=== 9. Cleanup: restore the original quantity ==="
curl -s -X PUT "$BASE/api/stock-take/$SESSION_ID" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"action\": \"save\", \"items\": [{\"id\": \"$ITEM_ID\", \"countedQty\": $ORIG_QTY}]}" > /dev/null
# Also restore via Inventory endpoint to be safe
curl -s -X PUT "$BASE/api/inventory" \
  "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"productId\": \"$PRODUCT_ID\", \"quantity\": $ORIG_QTY}" > /dev/null
RESTORED_QTY=$(curl -s "$BASE/api/products?search=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$PRODUCT_NAME'))")&limit=1" "${AUTH[@]}" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["products"][0]["inventory"][0]["quantity"])')
echo "  Restored Inventory.quantity: $RESTORED_QTY (original was $ORIG_QTY)"
echo ""

echo "=== ALL TESTS PASSED ==="
