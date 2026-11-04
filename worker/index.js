// worker/index.js
// Router ringkas: /api/* dikendalikan Worker, selebihnya aset statik public/.
// `run_worker_first` dalam wrangler.jsonc memastikan Worker hanya dipanggil
// untuk laluan /api/*; permintaan lain dihidangkan terus oleh pelayan aset.

import { API_HEADERS, SECURITY_HEADERS, handleRoster } from './roster.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api/roster') {
      return handleRoster(request, env);
    }

    if (path === '/api' || path.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Laluan API tidak ditemui.' }),
        { status: 404, headers: { ...API_HEADERS, 'Cache-Control': 'no-store' } },
      );
    }

    // Fallback keselamatan: hidangkan aset statik jika Worker dipanggil
    // untuk laluan bukan API.
    if (env && env.ASSETS) return env.ASSETS.fetch(request);

    return new Response('Tidak ditemui', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...SECURITY_HEADERS,
      },
    });
  },
};
