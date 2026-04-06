import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SERVER_START_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 3000;

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'simpleswap-test-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function startServer(seedPools) {
  return withTempDir(async (dir) => {
    const poolFile = path.join(dir, 'exchange-pool.json');
    await writeFile(poolFile, JSON.stringify(seedPools, null, 2), 'utf8');

    const port = 4100 + Math.floor(Math.random() * 1000);
    const child = spawn(process.execPath, ['pool-server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        NODE_ENV: 'test',
        MERCHANT_WALLET: '0x1372Ad41B513b9d6eC008086C03d69C635bAE578',
        PRICE_POINTS: '19,29,59',
        POOL_SIZE_PER_PRICE: '5',
        MIN_POOL_SIZE: '5',
        POOL_FILE_PATH: poolFile,
        STEEL_API_KEY: 'test-key',
        RENDER_EXTERNAL_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let logs = '';
    child.stdout.on('data', (chunk) => {
      logs += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      logs += chunk.toString();
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const startedAt = Date.now();
    while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
      try {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok) {
          return {
            baseUrl,
            logsRef: () => logs,
            stop: async () => {
              child.kill('SIGTERM');
              await Promise.race([
                new Promise((resolve) => child.once('exit', resolve)),
                wait(2000).then(() => {
                  if (!child.killed) child.kill('SIGKILL');
                }),
              ]);
            },
          };
        }
      } catch {
        // Retry until the server is ready.
      }
      if (child.exitCode !== null) {
        throw new Error(`Server exited early with code ${child.exitCode}\n${logs}`);
      }
      await wait(200);
    }

    child.kill('SIGKILL');
    throw new Error(`Server did not start within ${SERVER_START_TIMEOUT_MS}ms\n${logs}`);
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json();
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

test('root/admin endpoints reflect seeded pool state without runtime reference errors', async () => {
  const server = await startServer({
    '19': [{ exchangeId: 'seed-19', exchangeUrl: 'https://example.com/19', amount: 19 }],
    '29': [],
    '59': [],
  });

  try {
    const { body: root } = await fetchJson(`${server.baseUrl}/`);
    assert.equal(root.status, 'running');
    assert.equal(root.pools['19'], 1);
    assert.equal(root.totalSize, 1);
    assert.ok(root.stats.serverStartTime);

    const { response, body } = await fetchJson(`${server.baseUrl}/admin/add-one`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricePoint: 19 }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok', pool: 1 });

    const { body: adminPool } = await fetchJson(`${server.baseUrl}/admin/pool`);
    assert.equal(adminPool.pools['19'].length, 1);
    assert.match(adminPool.serverStartTime, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await server.stop();
  }
});

test('admin/add-one queues immediately when the target pool is empty', async () => {
  const server = await startServer({ '19': [], '29': [], '59': [] });

  try {
    const startedAt = Date.now();
    const { response, body } = await fetchJson(`${server.baseUrl}/admin/add-one`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pricePoint: 19 }),
    });
    const durationMs = Date.now() - startedAt;

    assert.equal(response.status, 202);
    assert.deepEqual(body, { status: 'queued', price: '19' });
    assert.ok(durationMs < 1000, `expected an immediate response, got ${durationMs}ms`);
  } finally {
    await server.stop();
  }
});
