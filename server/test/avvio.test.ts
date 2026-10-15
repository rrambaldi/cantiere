import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { connect, createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { apriDb, migra } from "../src/db.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

async function portaLibera() {
  const s = createServer().listen(0, "127.0.0.1");
  await once(s, "listening");
  const { port } = s.address() as AddressInfo;
  await new Promise((ok) => s.close(ok));
  return port;
}

test("SIGTERM ferma il server anche con una richiesta ancora aperta", async () => {
  const dir = await mkdtemp(join(tmpdir(), "forgia-avvio-"));
  const database_url = `sqlite:${join(dir, "t.db")}`;
  const db = await apriDb(database_url);
  await migra(db);
  await db.destroy();
  const porta = await portaLibera();
  const server = spawn(process.execPath, [MAIN], {
    env: { ...process.env, FORGIA_DATABASE_URL: database_url, FORGIA_BIND: `127.0.0.1:${porta}` },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    await once(server.stdout, "data"); // riga di avvio
    // Una richiesta a metà, come uno stream MCP che il client tiene aperto.
    const socket = connect(porta, "127.0.0.1");
    socket.on("error", () => {}); // il server taglia la connessione: è quello che si vuole
    await once(socket, "connect");
    socket.write("POST /api/v1/eventi HTTP/1.1\r\nHost: 127.0.0.1\r\n");
    server.kill("SIGTERM");
    const uscita = await Promise.race([
      once(server, "exit"),
      new Promise((ok) => setTimeout(ok, 3000, "timeout")),
    ]);
    assert.notEqual(uscita, "timeout", "il server non si è fermato entro 3 s");
    socket.destroy();
  } finally {
    server.kill("SIGKILL");
    await rm(dir, { recursive: true, force: true });
  }
});
