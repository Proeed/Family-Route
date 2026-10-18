import pm2 from 'pm2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TUNNEL_LOG_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.pm2', 'logs', 'family-route-tunnel-error.log');
const STATUS_FILE = path.join(__dirname, 'tunnel-status.json');

const CHECK_INTERVAL_MS = 90 * 1000; // how often to check reachability
const RESTART_COOLDOWN_MS = 45 * 1000; // give a fresh tunnel time to register before checking again
const HEALTH_TIMEOUT_MS = 8000;

let lastRestartAt = 0;

function log(msg) {
  console.log(`[watchdog] ${new Date().toISOString()} ${msg}`);
}

function getCurrentTunnelUrl() {
  if (!fs.existsSync(TUNNEL_LOG_PATH)) return null;
  const content = fs.readFileSync(TUNNEL_LOG_PATH, 'utf-8');
  const matches = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
  return matches ? matches[matches.length - 1] : null;
}

async function checkHealth(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

function writeStatus(status) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
}

function restartTunnel() {
  log('Restarting family-route-tunnel...');
  lastRestartAt = Date.now();
  pm2.connect((connectErr) => {
    if (connectErr) {
      log(`pm2.connect failed: ${connectErr.message}`);
      return;
    }
    pm2.restart('family-route-tunnel', (restartErr) => {
      pm2.disconnect();
      log(restartErr ? `pm2.restart failed: ${restartErr.message}` : 'Restart succeeded.');
    });
  });
}

async function tick() {
  if (Date.now() - lastRestartAt < RESTART_COOLDOWN_MS) {
    log('In cooldown after a recent restart, skipping this check.');
    return;
  }

  const url = getCurrentTunnelUrl();
  if (!url) {
    log('No tunnel URL found in logs yet.');
    writeStatus({ url: null, healthy: false, lastCheckedAt: new Date().toISOString() });
    return;
  }

  const healthy = await checkHealth(url);
  log(`${url} -> ${healthy ? 'OK' : 'DOWN'}`);
  writeStatus({ url, healthy, lastCheckedAt: new Date().toISOString() });

  if (!healthy) {
    restartTunnel();
  }
}

log(`Starting tunnel watchdog — checking every ${CHECK_INTERVAL_MS / 1000}s.`);
tick();
setInterval(tick, CHECK_INTERVAL_MS);
