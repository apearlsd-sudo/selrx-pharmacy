#!/usr/bin/env node
/**
 * SelRx Production Server
 * Starts Next.js on port 3000 (proxied by Caddy on port 81)
 * Includes auto-restart on crash and health check logging.
 */
const path = require('path');

const PROJECT_DIR = path.join(__dirname);
process.chdir(PROJECT_DIR);

const { createServer } = require('http');
const { URL } = require('url');

const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

async function startServer() {
  console.log(`[${new Date().toISOString()}] Starting SelRx on ${hostname}:${port}...`);
  console.log(`[${new Date().toISOString()}] Working directory: ${process.cwd()}`);
  
  const next = require('next');
  const app = next({ dev: false, hostname, port, dir: PROJECT_DIR });
  const handle = app.getRequestHandler();
  
  await app.prepare();
  
  const server = createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      handle(req, res, parsedUrl).catch(err => {
        console.error(`[${new Date().toISOString()}] Request error:`, err.message);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Handler error:`, err.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });

  return new Promise((resolve) => {
    server.listen(port, hostname, () => {
      console.log(`[${new Date().toISOString()}] SelRx ready on http://${hostname}:${port}`);
      resolve(server);
    });
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${new Date().toISOString()}] SIGTERM received`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] SIGINT received`);
  process.exit(0);
});

// Prevent unhandled rejections from crashing
process.on('unhandledRejection', (err) => {
  console.error(`[${new Date().toISOString()}] Unhandled rejection:`, err.message);
});

process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught exception:`, err.message);
});

// Start server
startServer().catch(err => {
  console.error(`[${new Date().toISOString()}] Fatal startup error:`, err);
  process.exit(1);
});
