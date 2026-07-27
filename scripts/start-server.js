// SelRx persistent server — reads PORT from env, caps memory
// This file is a fallback; start-server.sh (using next start) is preferred.
const next = require('next');
const { createServer } = require('http');
const path = require('path');

process.chdir(path.join(__dirname, '..'));

const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, require('url').parse(req.url, true)).catch(err => {
      console.error('[ReqErr]', err.message);
      if (!res.headersSent) { res.statusCode = 500; res.end(); }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`[${new Date().toISOString()}] SelRx on http://${hostname}:${port} (PID=${process.pid})`);
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
  process.on('unhandledRejection', (r) => console.error('[Rejection]', r));
  process.on('uncaughtException', (e) => {
    console.error('[Exception]', e.message);
    process.exit(1);
  });
}).catch(e => { console.error('[Startup]', e.message); process.exit(1); });
