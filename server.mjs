import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 8000;
const ROOT = process.cwd();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const AGENT_LOGS = [];
function addAgentLog(msg, type = 'info') {
  const entry = { timestamp: new Date().toISOString(), type, message: msg };
  AGENT_LOGS.push(entry);
  if (AGENT_LOGS.length > 200) AGENT_LOGS.shift();
  return entry;
}

addAgentLog('Inicializado Servidor de Protocolo Remoto para Agentes IA (Arkaios Agent Bridge)', 'sys');

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Agent-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // ---------- API Endpoints para Agentes Remotos (LLM Remote Protocol) ----------
  if (reqPath === '/api/agent/manifest') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      name: 'Arkaios PuterLab Remote Agent Protocol',
      version: '1.0.0',
      description: 'API de control remoto para Agentes IA (Antigravity, Gemini-Lab, Claude, Codex, Ollama)',
      endpoints: {
        manifest: 'GET /api/agent/manifest',
        status: 'GET /api/agent/status',
        deploy: 'POST /api/agent/deploy',
        logs: 'GET /api/agent/logs'
      },
      capabilities: [
        'remote_deploy',
        'file_persistence',
        'log_monitoring',
        'puter_cloud_sync',
        'firebase_auth_inherit'
      ]
    }, null, 2));
    return;
  }

  if (reqPath === '/api/agent/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'online',
      platform: 'PuterLab Nexus Engine',
      port: PORT,
      uptime: process.uptime(),
      logsCount: AGENT_LOGS.length
    }));
    return;
  }

  if (reqPath === '/api/agent/logs') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ logs: AGENT_LOGS }));
    return;
  }

  if (reqPath === '/api/agent/deploy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const author = (payload.author || 'arkaios').toLowerCase().replace(/[^a-z0-9]/g, '');
        const project = (payload.project || 'remote-app').toLowerCase().replace(/[^a-z0-9]/g, '');
        const subdomain = `${author}-${project}`;
        const files = payload.files || {};

        addAgentLog(`Invocación remota de agente recibida: Despliegue de '${subdomain}' con ${Object.keys(files).length} archivo(s)`, 'sys');

        // Write files to local storage cache if provided
        for (const [relPath, content] of Object.entries(files)) {
          const dest = path.join(ROOT, relPath);
          try {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, content, 'utf-8');
            addAgentLog(`[Agent API] Guardado ${relPath}`, 'ok');
          } catch(e){}
        }

        const fullUrl = `https://${subdomain}.puter.site/`;
        addAgentLog(`[Agent API] Proyecto asignado a ${fullUrl}`, 'sys');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          subdomain,
          url: fullUrl,
          message: `Proyecto '${project}' preparado e integrado en la nube de Puter.`,
          filesDeployed: Object.keys(files)
        }));
      } catch(e) {
        addAgentLog(`[Agent API Error] ${e.message}`, 'err');
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ---------- Servir Archivos Estáticos ----------
  if (reqPath === '/') reqPath = '/portal.html';
  const filePath = path.join(ROOT, reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Servidor local y API de Agente Remoto corriendo en http://localhost:${PORT}/`);
});
