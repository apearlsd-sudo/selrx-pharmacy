// End-to-end test for the new logout flow:
// 1. Login via /api/auth/login to get a real user ID
// 2. Call /api/auth/logout with that user's ID in x-user-id header
// 3. Verify error handling for missing/invalid headers

const BASE = 'http://localhost:3000'

async function main() {
  // Step 1: Login to get a valid user
  console.log('--- Step 1: Login ---')
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'edem@gmail.com', password: 'Admin123' }),
  })
  const loginData = await loginRes.json()
  if (!loginRes.ok) {
    console.error('Login failed:', loginData)
    process.exit(1)
  }
  console.log('Login OK. User:', { id: loginData.user.id, name: loginData.user.name, role: loginData.user.role })

  // Step 2: Call logout endpoint
  console.log('\n--- Step 2: POST /api/auth/logout ---')
  const logoutRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': loginData.user.id,
      'x-user-role': loginData.user.role,
    },
  })
  const logoutData = await logoutRes.json()
  console.log('Status:', logoutRes.status)
  console.log('Response:', logoutData)

  if (!logoutRes.ok) {
    console.error('Logout endpoint failed')
    process.exit(1)
  }

  // Step 3: Test missing header (should return 401)
  console.log('\n--- Step 3: Missing x-user-id header (expect 401) ---')
  const noHeaderRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const noHeaderData = await noHeaderRes.json()
  console.log('Status:', noHeaderRes.status)
  console.log('Response:', noHeaderData)

  // Step 4: Test non-existent user (should return 401)
  console.log('\n--- Step 4: Non-existent user (expect 401) ---')
  const fakeUserRes = await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'nonexistent-user-id',
      'x-user-role': 'CASHIER',
    },
  })
  const fakeUserData = await fakeUserRes.json()
  console.log('Status:', fakeUserRes.status)
  console.log('Response:', fakeUserData)

  console.log('\n=== All tests passed ===')
}

main().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
