// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildDemoOrder, type MockCommerce } from "@traxo/commerce";
import { type Db, openDb, saveOrder } from "@traxo/db";
import { createTraxoMcp, inProcessClient } from "@traxo/mcp-server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerApi } from "../src/api.ts";
import { createApp } from "../src/app.ts";
import { registerBuilderApi } from "../src/builder.ts";
import { registerGrowthApi } from "../src/growth.ts";
import { mountMcp } from "../src/mcp.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";
import { registerUsageApi } from "../src/usage-api.ts";

let db: Db;
let rt: Runtime;
let app: ReturnType<typeof createApp>;
let client: Client;

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ text: string }>;
    isError?: boolean;
  };
  return { text: r.content[0]?.text ?? "", isError: Boolean(r.isError) };
};

beforeEach(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
  app = createApp({ db, bus: rt.bus, commerce: rt.commerceMap });
  registerApi(app, rt);
  registerGrowthApi(app, rt);
  registerBuilderApi(app, rt);
  registerUsageApi(app, rt);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createTraxoMcp(inProcessClient(app)).connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});
afterEach(async () => {
  await client.close();
  await db.close();
});

async function pending() {
  const order = buildDemoOrder({ dane: "66001", payment: "cod", number: 5001 });
  (rt.commerce as MockCommerce).receive(order);
  await saveOrder(db, order);
  return order;
}

describe("servidor MCP de Traxo", () => {
  it("expone las herramientas esperadas", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of [
      "traxo_estado",
      "listar_pedidos",
      "cotizar_envio",
      "crear_guia",
      "rastrear_guia",
      "marcar_novedad",
      "resolver_aprobacion",
      "enviar_whatsapp",
      "configurar_autonomia",
    ]) {
      expect(names).toContain(n);
    }
  });

  it("traxo_estado dice qué es real y qué es simulado", async () => {
    const { text } = await call("traxo_estado");
    expect(text).toContain("Café de Origen");
    expect(text).toMatch(/Envia\.com: simulado/);
    expect(text).toMatch(/WhatsApp \(Zernio\): simulado/);
  });

  it("cotizar_envio explica sin crear guías", async () => {
    await pending();
    const { text } = await call("cotizar_envio", { pedido: "#5001" });
    expect(text).toMatch(/^Elegí /);
    expect(await db.prisma.shipment.count()).toBe(0);
  });

  it("crear_guia sin confirm solo muestra el borrador; con confirm la genera y la tienda la recibe", async () => {
    await pending();
    const draft = await call("crear_guia", { pedido: "#5001" });
    expect(draft.text).toContain("confirm: true");
    expect(await db.prisma.shipment.count()).toBe(0);
    const done = await call("crear_guia", { pedido: "#5001", confirm: true });
    expect(done.text).toMatch(/Listo: guía \d{12}/);
    expect((rt.commerce as MockCommerce).fulfillments).toHaveLength(1);
    expect((await call("crear_guia", { pedido: "#5001", confirm: true })).text).toContain(
      "ya tiene la guía",
    );
  });

  it("marcar_novedad escribe al cliente solo con confirm, y rastrear_guia lo refleja", async () => {
    await pending();
    await call("crear_guia", { pedido: "#5001", confirm: true });
    const guia = (await db.prisma.shipment.findFirstOrThrow()).trackingNumber;
    const sentBefore = (rt.messaging as unknown as { sent: unknown[] }).sent.length;
    expect((await call("marcar_novedad", { guia })).text).toContain("confirm: true");
    expect((rt.messaging as unknown as { sent: unknown[] }).sent.length).toBe(sentBefore);
    await call("marcar_novedad", { guia, descripcion: "Cliente ausente", confirm: true });
    expect((rt.messaging as unknown as { sent: unknown[] }).sent.length).toBe(sentBefore + 1);
    expect((await call("rastrear_guia", { guia })).text).toContain("incident");
  });

  it("autonomía 0: la guía queda como aprobación y resolver_aprobacion la ejecuta con confirm", async () => {
    await call("configurar_autonomia", { nivel: 0, confirm: true });
    await call("demo_simular_pedido", { dane: "76001" });
    const list = await call("listar_aprobaciones");
    const id = list.text.split(" ")[0] ?? "";
    expect(id).toMatch(/^apr_/);
    expect((await call("resolver_aprobacion", { id, decision: "aprobar" })).text).toContain(
      "confirm: true",
    );
    expect(await db.prisma.shipment.count()).toBe(0);
    await call("resolver_aprobacion", { id, decision: "aprobar", confirm: true });
    expect(await db.prisma.shipment.count()).toBe(1);
  });

  it("devuelve errores claros en español", async () => {
    const r = await call("ver_pedido", { pedido: "#9999" });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("No encuentro ese pedido");
  });
});

describe("/mcp por HTTP (modo nube)", () => {
  it("responde con token y rechaza sin él", async () => {
    mountMcp(app, "secreto");
    const bad = await app.request("/mcp", { method: "POST", body: "{}" });
    expect(bad.status).toBe(401);
    const init = await app.request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer secreto",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      }),
    });
    expect(init.status).toBe(200);
    expect(JSON.stringify(await init.json())).toContain("traxo");
  });
});

describe("campañas por MCP", () => {
  const input = {
    platform: "meta",
    productTitle: "Kit degustación x3",
    dailyBudget: 30000,
    audience: { cities: ["Bogotá"], customerSegment: "inactivo" },
    copy: {
      headlines: ["Tres orígenes, un kit"],
      primaryTexts: ["Prueba café de Huila, Nariño y Sierra Nevada."],
    },
    creatives: [{ kind: "image", prompt: "Kit de café sobre mesa de madera, luz de mañana" }],
  };
  it("guarda el borrador como DRAFT y lo exporta", async () => {
    const r = await call("crear_borrador_campana", input);
    expect(r.text).toContain("(DRAFT)");
    const id = r.text.match(/cmp_[a-f0-9]+/)?.[0] ?? "";
    expect((await call("exportar_borrador", { id })).text).toContain("no creada en la plataforma");
    expect((await call("listar_borradores")).text).toContain("DRAFT");
  });
  it("rechaza copy que excede los límites y no guarda nada", async () => {
    const r = await call("crear_borrador_campana", {
      ...input,
      copy: { headlines: ["x".repeat(60)], primaryTexts: ["ok"] },
    });
    expect(r.isError).toBe(true);
    expect(r.text).toContain("no cumple los límites");
    expect(await db.prisma.campaignDraft.count()).toBe(0);
  });
  it("solo marca PAUSED si la pausa se verificó; si no, avisa en rojo", async () => {
    const id = (await call("crear_borrador_campana", input)).text.match(/cmp_[a-f0-9]+/)?.[0] ?? "";
    const sin = await call("registrar_campana_creada", {
      id,
      id_plataforma: "g_123",
      pausa_verificada: false,
    });
    expect(sin.text).toContain("ATENCIÓN");
    expect((await db.prisma.campaignDraft.findUniqueOrThrow({ where: { id } })).status).toBe(
      "DRAFT",
    );
    await call("registrar_campana_creada", { id, id_plataforma: "g_123", pausa_verificada: true });
    expect((await db.prisma.campaignDraft.findUniqueOrThrow({ where: { id } })).status).toBe(
      "PAUSED",
    );
  });
});

describe("herramientas de crecimiento por MCP", () => {
  it("expone las herramientas nuevas", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name);
    for (const n of [
      "importar_tienda",
      "auditar_tienda",
      "sugerir_campana",
      "reporte_ventas",
      "reporte_atribucion",
      "reporte_logistica",
      "crear_audiencia",
      "mensaje_a_segmento",
      "configurar_confirmacion",
      "cancelar_guia",
      "programar_recogida",
      "exportar_datos_cliente",
      "borrar_datos_cliente",
    ])
      expect(names, n).toContain(n);
  });

  it("auditar_tienda dice el puntaje sobre los checks medidos, marca el ejemplo y nombra los N/A", async () => {
    const r = await call("auditar_tienda", { tipo: "seo" });
    expect(r.text).toMatch(
      /SEO: \d+ sobre 100, calculado sobre \d+ de \d+ checks \(informe de EJEMPLO\)/,
    );
    expect(r.text).toContain("Empieza por aquí");
    expect(r.text).toContain("No se pudo medir (N/A): Core Web Vitals");
  });

  it("auditar una URL real sin activarlo avisa en vez de salir a internet", async () => {
    const r = await call("auditar_tienda", { tipo: "seo", url: "https://example.com" });
    expect(r.text).toContain("TRAXO_AUDIT_LIVE=1");
  });

  it("sugerir_campana usa los datos del producto y no inventa el margen", async () => {
    const products = (await rt.commerce.listProducts()) as Array<{ id: string }>;
    const prod = await db.prisma.product.findFirstOrThrow();
    void products;
    const r = await call("sugerir_campana", { producto_id: prod.id, plataforma: "google" });
    expect(r.text).toContain("utm_campaign=");
    expect(r.text).toContain("ESTIMADO");
  });

  it("lo que escribe a clientes o borra datos solo corre con confirm", async () => {
    const preview = await call("mensaje_a_segmento", {
      segmento: "recompra",
      texto: "Hola, tenemos café nuevo para ti.",
    });
    expect(preview.text).toContain("Borrador");
    expect((rt.messaging as unknown as { sent: unknown[] }).sent).toHaveLength(0);
    const cu = await db.prisma.customer.findFirstOrThrow();
    expect((await call("borrar_datos_cliente", { cliente_id: cu.id })).text).toContain(
      "No se puede deshacer",
    );
    expect((await db.prisma.customer.findUniqueOrThrow({ where: { id: cu.id } })).name).toBe(
      cu.name,
    );
    await call("borrar_datos_cliente", { cliente_id: cu.id, confirm: true });
    expect((await db.prisma.customer.findUniqueOrThrow({ where: { id: cu.id } })).name).toBe(
      "Cliente eliminado",
    );
  });

  it("configurar_confirmacion pide confirm y luego cambia el comportamiento", async () => {
    expect((await call("configurar_confirmacion", { modo: "all" })).text).toContain(
      "confirm: true",
    );
    expect((await call("configurar_confirmacion", { modo: "all", confirm: true })).text).toContain(
      "«all»",
    );
  });

  it("los reportes responden con N/A donde no hay datos", async () => {
    expect((await call("reporte_atribucion")).text).toContain("Por canal");
    expect((await call("reporte_logistica")).text).toContain("Recaudo");
    expect((await call("reporte_ventas", { dias: 30 })).text).toMatch(/Últimos 30 días/);
  });
  it("uso_agentico resume sin inventar cuando no hay gasto", async () => {
    const { text } = await call("uso_agentico", { dias: 7 });
    expect(text).toContain("Últimos 7 días");
    expect(text).toContain("Retorno: N/A");
  });

  it("disenar_tienda crea un borrador y exportar_tema escribe solo con confirm, sin sobrescribir ni salir de la carpeta", async () => {
    const made = await call("disenar_tienda", { estilo: "calido", plataforma: "shopify" });
    expect(made.text).toMatch(/Listo: creé el diseño/);
    const id = /Id: (site_[\w-]+)/.exec(made.text)?.[1] as string;
    expect((await call("listar_disenos")).text).toContain(id);

    const dir = mkdtempSync(join(tmpdir(), "traxo-export-"));
    const spy = vi.spyOn(process, "cwd").mockReturnValue(dir);
    try {
      const draft = await call("exportar_tema", { diseno_id: id, carpeta: "mi-tema" });
      expect(draft.text).toContain("confirm: true");
      expect(existsSync(join(dir, "mi-tema"))).toBe(false);

      const out = await call("exportar_tema", { diseno_id: id, carpeta: "mi-tema", confirm: true });
      expect(out.text).toMatch(/escribí \d+ archivos/);
      expect(out.text).toContain("sin problemas");
      expect(readFileSync(join(dir, "mi-tema", "layout", "theme.liquid"), "utf8")).toContain(
        "content_for_header",
      );

      const again = await call("exportar_tema", {
        diseno_id: id,
        carpeta: "mi-tema",
        confirm: true,
      });
      expect(again.text).toContain("no la sobrescribo");

      const escape = await call("exportar_tema", {
        diseno_id: id,
        carpeta: "../fuera",
        confirm: true,
      });
      expect(escape.text).toContain("fuera del directorio");
      expect(existsSync(join(dir, "..", "fuera"))).toBe(false);

      const upd = await call("actualizar_diseno", { diseno_id: id, estado: "subido" });
      expect(upd.text).toContain("subido");
    } finally {
      spy.mockRestore();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
