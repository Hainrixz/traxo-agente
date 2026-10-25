// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "traxo-setup-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const run = (script: string, ...args: string[]) =>
  spawnSync("node", [join(process.cwd(), "scripts", script), "--dir", dir, ...args], {
    encoding: "utf8",
  });
const answers = JSON.stringify({
  adminEmail: "yo@mitienda.co",
  storeName: "Mi Marca",
  platform: "shopify",
  storeDomain: "mitienda.myshopify.com",
  envia: true,
  zernio: true,
  ai: true,
});
const envOf = (): Record<string, string> =>
  Object.fromEntries(
    readFileSync(join(dir, ".env"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z0-9_]+=/.test(l))
      .map((l) => [
        l.slice(0, l.indexOf("=")),
        l.slice(l.indexOf("=") + 1).replace(/^"(.*)"$/, "$1"),
      ]),
  );

describe("asistente de configuración", () => {
  it("crea el .env con secretos propios, deja en blanco las llaves de terceros y no imprime ningún valor", () => {
    const r = run("setup.mjs", "--answers", answers);
    expect(r.status).toBe(0);
    const e = envOf();
    expect(e.TRAXO_ADMIN_EMAIL).toBe("yo@mitienda.co");
    expect(e.SHOPIFY_STORE_DOMAIN).toBe("mitienda.myshopify.com");
    expect(e.TRAXO_SESSION_SECRET).toHaveLength(64);
    expect(e.TRAXO_ADMIN_PASSWORD.length).toBeGreaterThanOrEqual(20);
    expect(e.SHOPIFY_ADMIN_TOKEN).toBe("");
    expect(e.ENVIA_TOKEN).toBe("");
    expect(e.ANTHROPIC_API_KEY).toBe("");
    // El archivo es solo del dueño y la salida solo habla de nombres.
    expect((statSync(join(dir, ".env")).mode & 0o777).toString(8)).toBe("600");
    for (const secret of [e.TRAXO_SESSION_SECRET, e.TRAXO_ADMIN_PASSWORD, e.TRAXO_MCP_TOKEN])
      expect(r.stdout + r.stderr).not.toContain(secret);
    const out = JSON.parse(r.stdout);
    expect(out.generated).toEqual(
      expect.arrayContaining(["TRAXO_SESSION_SECRET", "TRAXO_ADMIN_PASSWORD"]),
    );
    expect(out.pending.map((p: { key: string }) => p.key)).toEqual(
      expect.arrayContaining([
        "SHOPIFY_ADMIN_TOKEN",
        "ENVIA_TOKEN",
        "ZERNIO_API_KEY",
        "ANTHROPIC_API_KEY",
      ]),
    );
  });

  it("al repetirlo respeta lo que ya había: no cambia secretos ni borra llaves puestas", () => {
    run("setup.mjs", "--answers", answers);
    const antes = envOf();
    writeFileSync(
      join(dir, ".env"),
      readFileSync(join(dir, ".env"), "utf8").replace(
        "SHOPIFY_ADMIN_TOKEN=",
        "SHOPIFY_ADMIN_TOKEN=shpat_mio",
      ),
    );
    const r = run("setup.mjs", "--answers", JSON.stringify({ platform: "shopify", wompi: true }));
    expect(r.status).toBe(0);
    const despues = envOf();
    expect(despues.TRAXO_SESSION_SECRET).toBe(antes.TRAXO_SESSION_SECRET);
    expect(despues.TRAXO_ADMIN_PASSWORD).toBe(antes.TRAXO_ADMIN_PASSWORD);
    expect(despues.SHOPIFY_ADMIN_TOKEN).toBe("shpat_mio");
    expect(despues.TRAXO_ADMIN_EMAIL).toBe("yo@mitienda.co");
    expect(despues).toHaveProperty("WOMPI_PRIVATE_KEY");
    expect(JSON.parse(r.stdout).generated).toEqual([]);
  });

  it("las direcciones con # o espacios quedan entre comillas y se leen completas", () => {
    run(
      "setup.mjs",
      "--answers",
      JSON.stringify({ origin: { street: "Calle 1 # 1-1", city: "Bogotá" } }),
    );
    const raw = readFileSync(join(dir, ".env"), "utf8");
    expect(raw).toContain('ORIGIN_STREET="Calle 1 # 1-1"');
    const again = run("setup.mjs", "--answers", "{}");
    expect(again.status).toBe(0);
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain('ORIGIN_STREET="Calle 1 # 1-1"');
  });

  it("limpia caracteres peligrosos de las respuestas (no se puede inyectar otra variable)", () => {
    run(
      "setup.mjs",
      "--answers",
      JSON.stringify({ adminEmail: "a@b.co\nEVIL=1", storeName: 'x"; rm -rf' }),
    );
    const e = envOf();
    expect(e).not.toHaveProperty("EVIL");
    expect(e.TRAXO_STORE_NAME).not.toContain('"');
  });
});

describe("doctor", () => {
  it("dice qué falta sin mostrar valores y falla mientras haya llaves pendientes", () => {
    run("setup.mjs", "--answers", answers);
    const secret = envOf().TRAXO_ADMIN_PASSWORD;
    const r = run("doctor.mjs", "--offline");
    expect(r.stdout).toContain("SHOPIFY_ADMIN_TOKEN");
    expect(r.stdout).toContain("✗");
    expect(r.stdout).not.toContain(secret);
    expect(r.status).toBe(1);
  });

  it("sin .env lo avisa y manda a correr el asistente", () => {
    const r = run("doctor.mjs", "--offline");
    expect(r.stdout).toContain("/traxo:instalar");
    expect(r.status).toBe(1);
  });
});

describe("railway-vars", () => {
  it("en simulacro lista solo nombres, apunta la base al Postgres del proyecto y no sube lo local", () => {
    run("setup.mjs", "--answers", answers);
    const r = run("railway-vars.mjs", "--dry-run");
    const out = JSON.parse(r.stdout);
    expect(out.names).toEqual(
      expect.arrayContaining(["TRAXO_SESSION_SECRET", "DATABASE_URL", "TRAXO_MEDIA_DIR"]),
    );
    expect(out.names).not.toContain("PORT");
    expect(r.stdout).not.toContain(envOf().TRAXO_SESSION_SECRET);
  });
});
