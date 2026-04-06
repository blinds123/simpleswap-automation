import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

async function waitForServer(port, child) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early with code ${child.exitCode}`);
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`server did not start on port ${port}`);
}

async function startServer(initialPool) {
  const dir = await mkdtemp(path.join(tmpdir(), "simpleswap-admin-add-one-"));
  const poolFile = path.join(dir, "pool.json");
  const port = 3300 + Math.floor(Math.random() * 1000);

  await writeFile(poolFile, JSON.stringify(initialPool, null, 2), "utf8");

  const child = spawn("node", ["pool-server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      PRICE_POINTS: "19,29,59",
      POOL_SIZE_PER_PRICE: "5",
      MIN_POOL_SIZE: "1",
      POOL_FILE_PATH: poolFile,
      STEEL_API_KEY: "ste-test-key",
      RENDER_EXTERNAL_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  await waitForServer(port, child);

  return { child, dir, logsRef: () => logs, port };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;

  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

test("POST /admin/add-one returns current pool size without blocking when pool already has exchanges", async () => {
  const server = await startServer({
    "19": [
      {
        exchangeId: "existing-1",
        exchangeUrl: "https://example.com/exchange?id=existing-1",
        amount: 19,
        created: new Date().toISOString(),
      },
    ],
    "29": [],
    "59": [],
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/admin/add-one`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePoint: 19 }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: "ok", pool: 1 });

    const poolResponse = await fetch(`http://127.0.0.1:${server.port}/admin/pool`);
    const poolBody = await poolResponse.json();
    assert.equal(poolBody.pools["19"].length, 1);
  } finally {
    await stopServer(server.child);
    await rm(server.dir, { recursive: true, force: true });
  }
});

test("POST /admin/add-one queues replenishment immediately when pool is empty", async () => {
  const server = await startServer({
    "19": [],
    "29": [],
    "59": [],
  });

  try {
    const startedAt = Date.now();
    const response = await fetch(`http://127.0.0.1:${server.port}/admin/add-one`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pricePoint: 19 }),
    });
    const elapsedMs = Date.now() - startedAt;
    const body = await response.json();

    assert.equal(response.status, 202);
    assert.deepEqual(body, { status: "queued", price: "19" });
    assert.ok(elapsedMs < 1500, `expected immediate response, got ${elapsedMs}ms`);
  } finally {
    await stopServer(server.child);
    await rm(server.dir, { recursive: true, force: true });
  }
});
