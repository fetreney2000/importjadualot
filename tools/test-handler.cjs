// Ujian pantas pengendali Worker tanpa deploy.
// Menggunakan Request/Response global Node 18+; Cache API dilangkau kerana
// `caches` tiada dalam Node.
const assert = require('node:assert/strict');

(async () => {
  const { handleRoster } = await import('../worker/roster.js');
  const worker = (await import('../worker/index.js')).default;

  for (const p of ['2026-11', undefined]) {
    const qs = p ? `?period=${encodeURIComponent(p)}` : '';
    const req = new Request(`https://jadualot.test/api/roster${qs}`);
    const res = await handleRoster(req, {});
    const body = await res.json();
    console.log(
      'period=', p || '(default)',
      'status=', res.status,
      'ok=', body.ok,
      'roster=', body.data && body.data.roster.periodKey,
      'slots=', body.data && body.data.assignments.length,
      'cache=', res.headers.get('X-Roster-Cache'),
    );
  }

  const bad = await handleRoster(new Request('https://jadualot.test/api/roster?period=november'), {});
  console.log('invalid period ->', bad.status, await bad.text());

  const post = await handleRoster(new Request('https://jadualot.test/api/roster', { method: 'POST' }), {});
  console.log('POST ->', post.status, post.headers.get('Allow'));

  // Header API mesti konsisten antara laluan yang sah dan 404.
  const notFound = await worker.fetch(new Request('https://jadualot.test/api/tidak-wujud'), {}, {});
  console.log(
    'unknown api ->', notFound.status,
    'CORS=', notFound.headers.get('Access-Control-Allow-Origin'),
    'CSP=', !!notFound.headers.get('Content-Security-Policy'),
    'HSTS=', !!notFound.headers.get('Strict-Transport-Security'),
  );
  assert.equal(notFound.status, 404);
  assert.equal(notFound.headers.get('Access-Control-Allow-Origin'), '*');
  assert.ok(notFound.headers.get('Content-Security-Policy'));
  assert.ok(notFound.headers.get('Strict-Transport-Security'));

  const preflight = await handleRoster(new Request('https://jadualot.test/api/roster', { method: 'OPTIONS' }), {});
  console.log('OPTIONS ->', preflight.status, 'CORS=', preflight.headers.get('Access-Control-Allow-Origin'));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
})();
