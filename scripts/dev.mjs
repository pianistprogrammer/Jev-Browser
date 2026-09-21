import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
if (existsSync('.env')) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync('.env', 'utf8')))) process.env[key] ??= value;
}

const cdpUrl = process.env.BROWSER_CDP_URL ?? 'http://127.0.0.1:9223';

const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) { try { child.kill('SIGTERM'); } catch {} }
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function launch(command, args, env = {}) {
  const child = spawn(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  children.push(child);
  child.on('error', err => { console.error(`[${command}] ${err.message}`); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
  return child;
}

async function waitFor(name, check, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (!stopping) {
    if (await check()) return true;
    if (Date.now() > deadline) { console.error(`Timed out waiting for ${name}.`); stop(1); return false; }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

async function cdpReady() {
  try {
    const r = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

// ── 1. Browser (Docker) ──────────────────────────────────────────────────────
const browserAlreadyUp = await cdpReady();
if (browserAlreadyUp) {
  console.log('Browser already running — skipping docker compose.');
} else {
  const composeFile = path.join(root, 'infra/docker-compose.yml');
  if (!existsSync(composeFile)) {
    console.error('infra/docker-compose.yml not found.');
    process.exit(1);
  }
  console.log('Starting browser container…');
  try {
    execSync(`docker compose -f ${composeFile} up -d --remove-orphans`, { stdio: 'inherit' });
  } catch {
    console.error('docker compose up failed. Is Docker running?');
    process.exit(1);
  }
  process.stdout.write('Waiting for browser CDP… ');
  const ready = await waitFor('browser CDP', cdpReady, 60000);
  if (!ready) process.exit(1);
  console.log('ready.');
}

// ── 2. API + Web ─────────────────────────────────────────────────────────────
if (!stopping) {
  console.log('Starting API and web.');
  launch('npm', ['run', 'dev', '--workspace', '@jev/api']);
  launch('npm', ['run', 'dev', '--workspace', '@jev/web']);
}
