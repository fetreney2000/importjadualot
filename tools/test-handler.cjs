// Ujian pantas pengendali Worker tanpa deploy.
// Menggunakan Request/Response global Node 18+; Cache API dilangkau kerana
// `caches` tiada dalam Node.
(async () => {
  const { handleRoster } = await import('../worker/roster.js');

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
})();
