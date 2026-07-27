// Persistent server startup script for SelRx
// Handles process keepalive and graceful shutdown

const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');

// Set working directory
process.chdir(path.join(__dirname, '..'));

const next = require('next');
const dev = false;
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl).catch(err => {
      console.error('Request error:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> SelRx server running on http://${hostname}:${port}`);
  });

  // Keep process alive
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    server.close(() => process.exit(0));
  });

  // Prevent unhandled rejections from killing the process
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err);
  });
  
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
  });
}).catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});
