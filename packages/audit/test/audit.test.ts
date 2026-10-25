// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  auditUrl,
  isPrivateAddress,
  sampleAudit,
  scoreChecks,
  UnsafeUrlError,
} from "../src/index.ts";

const GOOD = `<!doctype html><html lang="es-CO"><head><title>Café de especialidad colombiano | Café de Origen</title>
<meta name="description" content="Café de especialidad tostado en Bogotá. Envíos a toda Colombia y contraentrega en las principales ciudades del país.">
<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="canonical" href="https://t.co/">
<meta property="og:title" content="Café"><meta property="og:image" content="https://t.co/i.jpg"><link rel="icon" href="/f.ico">
<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer"}}</script></head>
<body><h1>Café colombiano</h1><a href="https://wa.me/573001234567">WhatsApp</a><button>Agregar al carrito</button>
<p>Envío en 3 días, contraentrega disponible. Precio $ 38.000</p>
<img src="a.jpg" alt="Huila" width="10" height="10" loading="lazy"><img src="b.jpg" alt="Nariño" width="10" height="10" loading="lazy"><img src="c.jpg" alt="Sierra" width="10" height="10" loading="lazy"></body></html>`;
const BAD = "<html><head></head><body><h1>a</h1><h1>b</h1><img src='x.jpg'></body></html>";
const pub = async () => ["93.184.216.34"];

function fakeSite(html: string, extras: Record<string, number> = {}) {
  return (async (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/") return new Response(html, { status: 200 });
    const status = extras[path] ?? 404;
    return new Response(path === "/sitemap.xml" && status === 200 ? "<urlset></urlset>" : "x", {
      status,
    });
  }) as unknown as typeof fetch;
}

describe("score", () => {
  it("excluye los N/A del total y dice sobre cuántos checks se calculó", () => {
    const r = scoreChecks([
      { id: "a", group: "g", title: "a", status: "pass", impact: "alto", evidence: "" },
      { id: "b", group: "g", title: "b", status: "fail", impact: "alto", evidence: "" },
      { id: "c", group: "g", title: "c", status: "na", impact: "alto", evidence: "" },
    ]);
    expect(r).toEqual({ score: 50, evaluated: 2, total: 3 });
    expect(
      scoreChecks([{ id: "n", group: "g", title: "n", status: "na", impact: "bajo", evidence: "" }])
        .score,
    ).toBeNull();
  });
  it("el informe de ejemplo está marcado como ejemplo y trae acciones priorizadas", () => {
    for (const k of ["seo", "diseno"] as const) {
      const r = sampleAudit(k);
      expect(r.source).toBe("sample");
      expect(r.score).toBeGreaterThan(40);
      expect(r.evaluated).toBeLessThan(r.total); // hay N/A honestos
      expect(r.quickWins.length).toBeGreaterThan(0);
    }
  });
});

describe("auditoría real sobre HTML", () => {
  it("una página bien hecha saca un score alto", async () => {
    const r = await auditUrl("seo", "https://tienda.co", {
      fetch: fakeSite(GOOD, { "/robots.txt": 200, "/sitemap.xml": 200 }),
      resolve: pub,
    });
    expect(r.source).toBe("live");
    expect(r.checks.find((c) => c.id === "schema")?.status).toBe("pass");
    expect(r.checks.find((c) => c.id === "cwv")?.status).toBe("na");
    expect(r.score).toBeGreaterThan(85);
  });
  it("una página pobre falla donde toca y prioriza lo importante", async () => {
    const r = await auditUrl("seo", "https://tienda.co", { fetch: fakeSite(BAD), resolve: pub });
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(by).toMatchObject({
      title: "fail",
      desc: "fail",
      h1: "warn",
      viewport: "fail",
      schema: "fail",
      alt: "fail",
    });
    expect(r.score).toBeLessThan(45);
    expect(r.quickWins[0]).toMatch(/Título|Meta|viewport|Schema|HTTPS/i);
  });
  it("la auditoría de diseño busca CTA, confianza, WhatsApp y precios en COP", async () => {
    const r = await auditUrl("diseno", "https://tienda.co", {
      fetch: fakeSite(GOOD),
      resolve: pub,
    });
    const by = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
    expect(by).toMatchObject({
      cta: "pass",
      trust: "pass",
      wa: "pass",
      cop: "pass",
      contrast: "na",
    });
    const bad = await auditUrl("diseno", "https://tienda.co", {
      fetch: fakeSite(BAD),
      resolve: pub,
    });
    expect(bad.checks.find((c) => c.id === "cta")?.status).toBe("fail");
  });
});

describe("protección SSRF", () => {
  it("rechaza direcciones internas, esquemas raros y dominios que resuelven a IP privada", async () => {
    for (const u of [
      "http://localhost:3000",
      "http://127.0.0.1",
      "http://169.254.169.254/latest",
      "http://10.0.0.5",
      "http://192.168.1.1",
      "ftp://x.co",
      "http://[::1]/",
      "http://intranet.internal",
    ]) {
      await expect(assertPublicUrl(u, pub), u).rejects.toBeInstanceOf(UnsafeUrlError);
    }
    await expect(
      assertPublicUrl("https://evil.co", async () => ["10.1.2.3"]),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicUrl("https://ok.co", pub)).resolves.toBeInstanceOf(URL);
  });
  it("revalida cada redirección", async () => {
    const f = (async (url: string) =>
      url.startsWith("https://tienda.co")
        ? new Response(null, { status: 302, headers: { location: "http://169.254.169.254/x" } })
        : new Response("secreto")) as unknown as typeof fetch;
    await expect(
      auditUrl("seo", "https://tienda.co", { fetch: f, resolve: pub }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("clasifica rangos privados", () => {
    expect(
      ["10.0.0.1", "172.16.5.4", "172.32.0.1", "100.64.1.1", "8.8.8.8", "::1", "fd00::1"].map(
        isPrivateAddress,
      ),
    ).toEqual([true, true, false, true, false, true, true]);
  });
});
