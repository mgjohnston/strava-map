import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import fs from 'fs'
import path from 'path'
import type { Plugin } from 'vite'

// Plugin to handle plan file writes in dev mode
function planApiPlugin(): Plugin {
  return {
    name: 'plan-api',
    configureServer(server) {
      server.middlewares.use('/__plan_api/index', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const index = JSON.parse(body);
              const filePath = path.resolve(__dirname, 'data', 'plans.json');
              fs.writeFileSync(filePath, JSON.stringify(index, null, 2));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(error) }));
            }
          });
        } else {
          res.writeHead(405);
          res.end();
        }
      });

      server.middlewares.use('/__plan_api/plan', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk.toString(); });
          req.on('end', () => {
            try {
              const { fileName, plan } = JSON.parse(body);
              const filePath = path.resolve(__dirname, 'data', fileName);
              fs.writeFileSync(filePath, JSON.stringify(plan, null, 2));
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: String(error) }));
            }
          });
        } else {
          res.writeHead(405);
          res.end();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), planApiPlugin()],
})
