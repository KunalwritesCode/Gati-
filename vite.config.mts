import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Serves POST /api/chat during `npm run dev` using the same handler as Vercel. */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'gati-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const mod = (await server.ssrLoadModule('/server/chatCore.ts')) as typeof import('./server/chatCore');
        let body: unknown;
        try {
          body = await mod.readJsonBody(req);
        } catch {
          res.statusCode = 400;
          return res.end('{"error":"bad_request"}');
        }
        const out = await mod.handleChat(body, {
          ip: req.socket.remoteAddress ?? 'dev',
          env: mod.aiEnvFrom(env),
        });
        res.statusCode = out.status;
        res.setHeader('Content-Type', 'application/json');
        for (const [k, v] of Object.entries(out.headers ?? {})) res.setHeader(k, v);
        res.end(JSON.stringify(out.body));
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    plugins: [react(), devApi(env)],
    build: {
      target: 'es2020',
      sourcemap: false,
      assetsInlineLimit: 0,
    },
  };
});
