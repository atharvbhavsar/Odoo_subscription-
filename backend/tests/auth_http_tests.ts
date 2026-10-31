import assert from 'assert';
import http from 'http';
import { app } from '../src/app';
import { runMigrations } from '../src/config/migrate';
import { runSeeds } from '../src/config/seed';

async function runHttpAuthTests() {
  console.log('====================================================');
  console.log('STARTING HTTP ENDPOINT AUTHENTICATION TEST SUITE');
  console.log('====================================================\n');

  await runMigrations();
  await runSeeds();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}/api/auth`;

  let sessionCookie = '';

  try {
    // 1. Customer Registration HTTP Test
    console.log('[HTTP 1] POST /api/auth/register...');
    const regEmail = `http.cust.${Date.now()}@example.com`;
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regEmail,
        password: 'ValidPassword!123',
        name: 'HTTP Customer',
        role: 'admin', // Attack attempt: should be ignored
      }),
    });
    const regJson = (await regRes.json()) as any;
    assert.strictEqual(regRes.status, 201, 'Registration returns 201 Created');
    assert.strictEqual(regJson.data.user.role, 'customer', 'Role strictly forced to customer');
    
    // Capture set-cookie
    const setCookie = regRes.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('brightloop.sid'), 'HTTP-only session cookie returned on registration');
    sessionCookie = setCookie.split(';')[0];
    console.log('✓ Public registration creates Customer and returns session cookie.');

    // 2. Current Session Endpoint GET /api/auth/me
    console.log('[HTTP 2] GET /api/auth/me (with session cookie)...');
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: { Cookie: sessionCookie },
    });
    const meJson = (await meRes.json()) as any;
    assert.strictEqual(meRes.status, 200, 'Returns 200 OK');
    assert.strictEqual(meJson.data.user.email, regEmail, 'Returns authenticated user context');
    console.log('✓ Current session endpoint validates session cookie and returns user context.');

    // 3. Unauthorized Access Rejection (No Cookie)
    console.log('[HTTP 3] GET /api/auth/me (unauthenticated)...');
    const unauthRes = await fetch(`${baseUrl}/me`);
    assert.strictEqual(unauthRes.status, 401, 'Rejects unauthenticated request with 401');
    console.log('✓ Unauthenticated requests rejected with 401 UNAUTHORIZED.');

    // 4. Logout POST /api/auth/logout
    console.log('[HTTP 4] POST /api/auth/logout...');
    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(logoutRes.status, 200, 'Logout returns 200 OK');
    console.log('✓ Logout endpoint destroys session successfully.');

    // Verify session invalidation after logout
    const afterLogoutRes = await fetch(`${baseUrl}/me`, {
      headers: { Cookie: sessionCookie },
    });
    assert.strictEqual(afterLogoutRes.status, 401, 'Invalidated session cookie is rejected');
    console.log('✓ Session invalidation on logout verified.');

    // 5. Login POST /api/auth/login
    console.log('[HTTP 5] POST /api/auth/login...');
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regEmail, password: 'ValidPassword!123' }),
    });
    assert.strictEqual(loginRes.status, 200, 'Login returns 200 OK');
    const loginCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    assert(loginCookie.includes('brightloop.sid'), 'Login issues new session cookie');
    console.log('✓ Valid login sets HTTP-only session cookie.');

    // 6. Forgot Password Request POST /api/auth/forgot-password
    console.log('[HTTP 6] POST /api/auth/forgot-password...');
    const forgotRes = await fetch(`${baseUrl}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regEmail }),
    });
    const forgotJson = (await forgotRes.json()) as any;
    assert.strictEqual(forgotRes.status, 200, 'Forgot password returns 200 OK');
    const devToken = forgotJson.data?.devResetToken;
    assert(devToken, 'Dev reset token generated');
    console.log('✓ Password reset link generated with SHA-256 token hash.');

    // 7. Reset Password Submission POST /api/auth/reset-password
    console.log('[HTTP 7] POST /api/auth/reset-password...');
    const resetRes = await fetch(`${baseUrl}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: devToken, newPassword: 'BrandNewPassword!99' }),
    });
    assert.strictEqual(resetRes.status, 200, 'Password reset returns 200 OK');
    console.log('✓ Password reset completed with updated credentials.');

    // 8. Single-Use Token Enforcement
    console.log('[HTTP 8] Reusing consumed password reset token...');
    const reuseRes = await fetch(`${baseUrl}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: devToken, newPassword: 'BrandNewPassword!99' }),
    });
    assert.strictEqual(reuseRes.status, 400, 'Reused token is rejected');
    console.log('✓ Consumed token is invalidated for single-use protection.');

    // 9. Admin-Only Staff Creation POST /api/auth/users/staff
    console.log('[HTTP 9] POST /api/auth/users/staff (as Admin)...');
    // Login as admin
    const adminLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@brightloop.com', password: 'Password@123' }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie')?.split(';')[0] || '';

    const staffRes = await fetch(`${baseUrl}/users/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        email: `staff.http.${Date.now()}@brightloop.com`,
        password: 'StaffPassword!123',
        name: 'New Staff Member',
      }),
    });
    const staffJson = (await staffRes.json()) as any;
    assert.strictEqual(staffRes.status, 201, 'Admin can create staff user');
    assert.strictEqual(staffJson.data.role, 'staff', 'Created user has role staff');
    console.log('✓ Admin-only staff creation verified.');

    // 10. Role Protection: Customer cannot create staff
    console.log('[HTTP 10] Customer attempting to call POST /api/auth/users/staff...');
    const customerStaffRes = await fetch(`${baseUrl}/users/staff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: loginCookie },
      body: JSON.stringify({
        email: `fake.staff.${Date.now()}@brightloop.com`,
        password: 'StaffPassword!123',
        name: 'Fake Staff',
      }),
    });
    assert.strictEqual(customerStaffRes.status, 403, 'Customer blocked with 403 Forbidden');
    console.log('✓ Customer blocked from administrative endpoints with 403 FORBIDDEN.');

    console.log('\n====================================================');
    console.log('ALL 10 HTTP AUTH ENDPOINT TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

runHttpAuthTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('HTTP auth test failed:', err);
    process.exit(1);
  });
