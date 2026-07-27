// Persistent server startup script for SelRx
// Handles process keepalive with proper error logging

const next = require('next');
const { createServer } = require('http');
const path = require('path');

process.chdir(path.join(__dirname, '..'));

const dev = false;
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    // Use WHATWG URL instead of deprecated url.parse
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    handle(req, res, url).catch(err => {
      console.error('[Request Error]', err.message || err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  });

  server.listen(port, hostname, () => {
    const ts = new Date().toISOString();
    console.log(`[${ts}] SelRx ready on http://${hostname}:${port}`);
  });

  process.on('SIGTERM', () => {
    console.log('[SIGTERM] Shutting down...');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('[SIGINT] Shutting down...');
    server.close(() => process.exit(0));
  });
}).catch(err => {
  console.error('[Startup Error]', err.message || err);
  process.exit(1);
});
