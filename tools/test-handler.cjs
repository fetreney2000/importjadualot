const { handler } = require('../netlify/functions/roster.js');
(async () => {
  for (const p of ['2026-11', undefined]) {
    const r = await handler({ queryStringParameters: p ? { period: p } : {} });
    const b = JSON.parse(r.body);
    console.log('period=', p || '(default)', 'status=', r.statusCode, 'ok=', b.ok,
      'roster=', b.data && b.data.roster.periodKey,
      'slots=', b.data && b.data.assignments.length,
      'cache=', r.headers['Cache-Control']);
  }
  const bad = await handler({ queryStringParameters: { period: 'november' } });
  console.log('invalid period ->', bad.statusCode, bad.body);
})();
