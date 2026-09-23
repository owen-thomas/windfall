import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Serve the `api/` handlers from the Vite dev server.
 *
 * Avoids depending on `vercel dev` (and the login/link dance that comes with
 * it) for local work. The shim supplies the three response methods the
 * handlers use — status, json, setHeader — which is the whole surface they
 * touch, so what runs in dev is the same code that deploys.
 *
 * Cache-Control is set by the handlers but has no effect here; there is no
 * CDN in front of the dev server. That is the intended difference, and it
 * means dev always sees live upstream data — with one exception below.
 *
 * `/api/windspeed` is cached here the way the CDN caches it in production
 * (4d): Open-Meteo rate-limits by IP, and every dev reload, `?state=` fixture
 * and test page asking it afresh got this machine a 429 on 23 September 2026.
 * A good answer is reused for its `s-maxage`; a failure falls back to the last
 * good one, as `stale-if-error` does on Vercel.
 */
const DEV_CACHED_ROUTES = new Set(['windspeed']);

function devApi(): Plugin {
  const devCache = new Map<string, { body: string; at: number; maxAgeMs: number }>();
  return {
    name: 'windfall-dev-api',
    configureServer(server) {
      // Vercel injects env vars into `process.env` in deployment; locally
      // there is no equivalent, and Vite's own .env handling only exposes
      // `import.meta.env.VITE_*` to client bundles, the opposite of what a
      // server-only key needs. `loadEnvFile` is a plain Node 22+ builtin, so
      // this needs no dependency — a missing file (no local key set) is a
      // silent no-op, and api/narration.ts already treats a missing key as
      // an ordinary generation failure.
      try {
        process.loadEnvFile();
      } catch {
        // No .env present — fine, narration falls back to its template.
      }
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        const url = new URL(req.url, 'http://localhost');
        const route = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
        if (!route || route.startsWith('_') || route.includes('..')) return next();

        const cached = DEV_CACHED_ROUTES.has(route) ? devCache.get(route) : undefined;
        if (cached && Date.now() - cached.at < cached.maxAgeMs) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('X-Dev-Cache', 'HIT');
          res.end(cached.body);
          return;
        }

        const shim = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return shim;
          },
          json(body: unknown) {
            if (!res.getHeader('Content-Type')) {
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            const text = JSON.stringify(body);
            if (DEV_CACHED_ROUTES.has(route)) {
              if (res.statusCode === 200) {
                const maxAge = /s-maxage=(\d+)/.exec(String(res.getHeader('Cache-Control') ?? ''));
                devCache.set(route, { body: text, at: Date.now(), maxAgeMs: (maxAge ? Number(maxAge[1]) : 300) * 1000 });
              } else if (res.statusCode >= 500 && cached) {
                // stale-if-error: the last good answer rather than the failure.
                res.statusCode = 200;
                res.setHeader('X-Dev-Cache', 'STALE');
                res.end(cached.body);
                return shim;
              }
            }
            res.end(text);
            return shim;
          },
        });

        void (async () => {
          try {
            const mod = await server.ssrLoadModule(`/api/${route}.ts`);
            const request = { url: req.url, query: Object.fromEntries(url.searchParams) };
            await mod.default(request, shim);
          } catch (err) {
            server.config.logger.error(`[dev-api] /api/${route} failed: ${String(err)}`);
            if (!res.writableEnded) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: String(err) }));
            }
          }
        })();
      });
    },
  };
}

export default defineConfig({
  plugins: [devApi()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        flow: resolve(__dirname, 'flow/index.html'),
        map: resolve(__dirname, 'map/index.html'),
      },
    },
  },
});
