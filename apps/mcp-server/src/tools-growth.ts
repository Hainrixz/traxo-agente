import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatCOP } from "@traxo/core";
import { z } from "zod";
import type { TraxoClient } from "./client.ts";
import { wrap } from "./tools.ts";

type Json = Record<string, any>;
const roas = (n: number | null) => (n == null ? "N/A" : `${String(n).replace(".", ",")}×`);
const pct = (n: number | null | undefined) => (n == null ? "N/A" : `${n} %`);

/** Herramientas de crecimiento y operación: tienda, auditoría, campañas, audiencias, reportes y datos del cliente. */
export function registerGrowthTools(server: McpServer, api: TraxoClient): void {
  server.registerTool(
    "importar_tienda",
    {
      title: "Importar la tienda",
      description:
        "Trae catálogo, clientes e historial de pedidos de la tienda conectada a la base de Traxo. Es idempotente: repetirlo no duplica.",
      inputSchema: {},
    },
    wrap(async () => {
      const r = await api.post<Json>("/api/store/import");
      return `Importé ${r.products} productos, ${r.customers} clientes y ${r.orders} pedidos nuevos (${r.platform}).`;
    }),
  );

  server.registerTool(
    "auditar_tienda",
    {
      title: "Auditar la tienda (SEO o diseño)",
      description:
        "Audita la tienda: SEO y visibilidad en IA, o diseño y conversión. Devuelve el puntaje SOBRE los checks que se pudieron medir (los N/A no cuentan), lo primero que hay que arreglar y la evidencia. Sin URL entrega el informe de ejemplo de la demo; con URL lee la página pública (solo si TRAXO_AUDIT_LIVE=1).",
      inputSchema: { tipo: z.enum(["seo", "diseno"]), url: z.string().optional() },
    },
    wrap(async ({ tipo, url }: { tipo: "seo" | "diseno"; url?: string }) => {
      const r = await api.post<Json>("/api/audits/run", { kind: tipo, url });
      if (!r.ok) return r.message as string;
      const rep = r.report as Json;
      const bad = (rep.checks as Json[]).filter((c) => c.status === "fail" || c.status === "warn");
      const na = (rep.checks as Json[]).filter((c) => c.status === "na");
      return [
        `${tipo === "seo" ? "SEO" : "Diseño"}: ${rep.score ?? "N/A"} sobre 100, calculado sobre ${rep.evaluated} de ${rep.total} checks${rep.source === "sample" ? " (informe de EJEMPLO)" : ""}.`,
        `Empieza por aquí:\n${(rep.quickWins as string[]).map((q, i) => `${i + 1}. ${q}`).join("\n") || "Nada urgente."}`,
        `Fallas y avisos (${bad.length}):\n${bad.map((c) => `- [${c.status === "fail" ? "FALLA" : "MEJORAR"}] ${c.title} — ${c.evidence}`).join("\n")}`,
        na.length ? `No se pudo medir (N/A): ${na.map((c) => c.title).join("; ")}.` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }),
  );

  server.registerTool(
    "listar_biblioteca",
    {
      title: "Listar la biblioteca de creativos",
      description:
        "Lista los videos UGC, fotos de producto y referencias que el usuario tiene en la biblioteca de Traxo. Úsala ANTES de generar nada con Higgsfield: lo que ya existe no cuesta créditos y sirve de referencia de estilo.",
      inputSchema: { tipo: z.enum(["ugc", "producto", "lifestyle", "referencia"]).optional() },
    },
    wrap(async ({ tipo }: { tipo?: string }) => {
      const rows = (await api.get<Json[]>("/api/media")).filter((m) => !tipo || m.role === tipo);
      if (!rows.length)
        return "La biblioteca está vacía. El usuario puede subir archivos en Marketing → Biblioteca, o puedes registrar los de Higgsfield con agregar_a_biblioteca.";
      return rows
        .map(
          (m) =>
            `- ${m.id} · ${m.kind === "video" ? "video" : "imagen"} · ${m.role} · ${m.title}${m.product ? ` (${m.product})` : ""} · origen: ${m.source}${m.sample ? " · EJEMPLO" : ""}`,
        )
        .join("\n");
    }),
  );

  server.registerTool(
    "agregar_a_biblioteca",
    {
      title: "Agregar un creativo a la biblioteca",
      description:
        "Registra en la biblioteca un archivo que ya existe (por ejemplo un video o imagen de Higgsfield) con su enlace https. No descarga ni publica nada y no cuesta créditos. Después se puede usar en cualquier anuncio.",
      inputSchema: {
        url: z.string().url(),
        titulo: z.string(),
        tipo: z.enum(["ugc", "producto", "lifestyle", "referencia"]).default("ugc"),
        producto: z.string().optional(),
        origen: z.enum(["higgsfield", "generado", "subido"]).default("higgsfield"),
      },
    },
    wrap(
      async (a: {
        url: string;
        titulo: string;
        tipo: string;
        producto?: string;
        origen: string;
      }) => {
        const r = await api.post<Json>("/api/media/link", {
          url: a.url,
          title: a.titulo,
          role: a.tipo,
          product: a.producto,
          source: a.origen,
        });
        return r.ok ? `Listo: «${a.titulo}» quedó en la biblioteca.` : (r.message as string);
      },
    ),
  );

  server.registerTool(
    "sugerir_campana",
    {
      title: "Sugerir campaña",
      description:
        "Propone copy (dentro de los límites de cada plataforma), público y creativos con su costo estimado en créditos para un producto de la tienda, usando sus ventas y margen reales. No crea ni gasta nada.",
      inputSchema: {
        producto_id: z.string(),
        plataforma: z.enum(["meta", "google", "tiktok"]),
        objetivo: z
          .enum(["ventas", "trafico", "mensajes", "reconocimiento"])
          .default("ventas")
          .optional(),
        presupuesto_diario: z.number().int().min(5000).default(30000).optional(),
      },
    },
    wrap(
      async (a: {
        producto_id: string;
        plataforma: string;
        objetivo?: string;
        presupuesto_diario?: number;
      }) => {
        const r = await api.post<Json>("/api/campaigns/suggest", {
          productId: a.producto_id,
          platform: a.plataforma,
          objective: a.objetivo,
          dailyBudget: a.presupuesto_diario,
        });
        if (!r.ok) return r.message as string;
        const c = r.copy as Json;
        return [
          `Propuesta para ${r.productTitle} en ${r.platform} (${formatCOP(r.dailyBudget)} al día), utm_campaign=${r.utmCampaign}`,
          `Por qué:\n${(r.rationale as string[]).map((x) => `- ${x}`).join("\n")}`,
          `Títulos: ${(c.headlines as string[]).join(" | ")}`,
          `Textos: ${(c.primaryTexts as string[]).join(" | ")}`,
          `Público: ${(r.audience.cities as string[]).join(", ") || "todo el país"}, ${r.audience.ageMin}–${r.audience.ageMax} años`,
          `Creativos (≈ ${r.credits.total} créditos, ESTIMADO; Higgsfield cotiza el real antes de generar):\n${(r.creatives as Json[]).map((x) => `- ${x.kind}: ${x.prompt}`).join("\n")}`,
          "Para guardarla como borrador: crear_borrador_campana. Nada se crea en la plataforma ni se gasta.",
        ].join("\n\n");
      },
    ),
  );

  server.registerTool(
    "reporte_ventas",
    {
      title: "Reporte de ventas",
      description:
        "Pedidos, ventas, ticket promedio, % contraentrega, % entregados y % devueltos de los últimos días.",
      inputSchema: { dias: z.number().int().min(7).max(120).default(30).optional() },
    },
    wrap(async ({ dias }: { dias?: number }) => {
      const r = await api.get<Json>(`/api/reports/overview?days=${dias ?? 30}`);
      const t = r.totals as Json;
      return `Últimos ${r.days} días: ${t.orders} pedidos · ventas ${formatCOP(t.revenue)} · ticket ${t.avgTicket == null ? "N/A" : formatCOP(t.avgTicket)} · contraentrega ${pct(t.codShare)} · entregados ${pct(t.deliveredPct)} · devueltos ${pct(t.returnedPct)} · cancelados ${t.cancelled}.`;
    }),
  );

  server.registerTool(
    "reporte_atribucion",
    {
      title: "Qué anuncio trajo qué venta",
      description:
        "Pedidos y ventas por canal (utm_source) y por campaña (utm_campaign), con el gasto que reporta la plataforma y el ROAS. Sin gasto conocido, el ROAS es N/A: nunca se inventa.",
      inputSchema: {},
    },
    wrap(async () => {
      const r = await api.get<Json>("/api/reports/attribution");
      const src = (r.sources as Json[])
        .map(
          (s) =>
            `- ${s.source}: ${s.orders} pedidos, ${formatCOP(s.revenue)}, entregados ${pct(s.deliveredPct)}`,
        )
        .join("\n");
      const camps = (r.campaigns as Json[])
        .map(
          (c) =>
            `- ${c.product} (${c.platform}, ${c.status}${c.sample ? ", ejemplo" : ""}): ${c.orders} pedidos, ${formatCOP(c.revenue)}, gasto ${c.spend == null ? "N/A" : formatCOP(c.spend)}, ROAS ${roas(c.roas)}${c.roas != null && c.roas < 1 ? "  ← gasta más de lo que vende" : ""}`,
        )
        .join("\n");
      return `Por canal:\n${src}\n\nPor campaña:\n${camps}`;
    }),
  );

  server.registerTool(
    "reporte_logistica",
    {
      title: "Reporte de logística",
      description:
        "Por transportadora: envíos, % entregados, novedades, devueltos, costo y días promedio, y el recaudo de contraentrega cobrado y en ruta.",
      inputSchema: {},
    },
    wrap(async () => {
      const r = await api.get<Json>("/api/reports/logistics");
      const rows = (r.carriers as Json[])
        .map(
          (c) =>
            `- ${c.carrier}: ${c.shipments} envíos · entregados ${c.deliveredPct} % · novedades ${c.incidentPct} % · devueltos ${c.returnedPct} % · ${formatCOP(c.avgCost)} · ${c.avgDays ?? "N/A"} días${c.shipments < 10 ? "  (pocos envíos: dato poco confiable)" : ""}`,
        )
        .join("\n");
      return `${rows}\n\nRecaudo: cobrado en entregas ${formatCOP(r.cod.collected)} · en ruta ${formatCOP(r.cod.inTransit)}.\n${r.note}`;
    }),
  );

  server.registerTool(
    "crear_audiencia",
    {
      title: "Crear audiencia",
      description:
        "Crea una audiencia local desde un segmento de clientes. Solo cuenta a quienes dieron consentimiento y no pidieron la baja. No sube nada a ninguna plataforma.",
      inputSchema: { segmento: z.enum(["recompra", "nuevo", "inactivo"]) },
    },
    wrap(async ({ segmento }: { segmento: string }) => {
      const r = await api.post<Json>("/api/audiences", { segment: segmento });
      return r.ok
        ? `Audiencia «${r.audience.name}»: ${r.audience.size} clientes con consentimiento (${r.excluded} excluidos). Subirla a Meta se hace desde Claude con el conector, con teléfonos cifrados.`
        : (r.message as string);
    }),
  );

  server.registerTool(
    "mensaje_a_segmento",
    {
      title: "Mensaje de recompra a un segmento",
      description:
        "Escribe por WhatsApp a un segmento de clientes. Solo a quienes dieron consentimiento; añade «responde BAJA». Sin confirm solo dice a cuántos llegaría. ESCRIBE a personas: pide confirm.",
      inputSchema: {
        segmento: z.enum(["recompra", "nuevo", "inactivo"]),
        texto: z.string().min(10),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async ({
        segmento,
        texto,
        confirm,
      }: {
        segmento: string;
        texto: string;
        confirm?: boolean;
      }) => {
        const r = await api.post<Json>("/api/broadcasts", {
          segment: segmento,
          text: texto,
          confirm,
        });
        if (!r.ok) return r.message as string;
        if (r.preview)
          return `Borrador: llegaría a ${r.recipients} clientes con consentimiento (${r.excluded} excluidos). Texto: «${texto}». Llama de nuevo con confirm: true para enviar.`;
        return `Envié a ${r.sent} clientes${r.simulated ? " (simulado: nada salió de verdad)" : ""}; ${r.excluded} excluidos.`;
      },
    ),
  );

  server.registerTool(
    "configurar_confirmacion",
    {
      title: "Configurar la confirmación de contraentrega",
      description:
        "Define cuándo se le pide confirmar al cliente por WhatsApp antes de generar la guía: nunca, solo si hay riesgo, o siempre; el umbral de riesgo y el descuento por pagar ahora. Cambia cómo actúa el agente: pide confirm.",
      inputSchema: {
        modo: z.enum(["off", "risky", "all"]),
        umbral_riesgo: z.number().int().min(1).max(100).optional(),
        descuento_prepago: z.number().int().min(0).max(30).optional(),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async (a: {
        modo: string;
        umbral_riesgo?: number;
        descuento_prepago?: number;
        confirm?: boolean;
      }) => {
        if (!a.confirm)
          return `Borrador: confirmar contraentrega «${a.modo}»${a.umbral_riesgo ? `, desde riesgo ${a.umbral_riesgo}/100` : ""}${a.descuento_prepago != null ? `, ${a.descuento_prepago} % de descuento por pagar ahora` : ""}. Llama de nuevo con confirm: true.`;
        const s = await api.post<Json>("/api/settings", {
          confirmCod: a.modo,
          ...(a.umbral_riesgo ? { riskThreshold: a.umbral_riesgo } : {}),
          ...(a.descuento_prepago != null ? { prepaidDiscountPct: a.descuento_prepago } : {}),
        });
        return `Listo: confirmación «${s.confirmCod}», riesgo desde ${s.riskThreshold}/100, ${s.prepaidDiscountPct} % por pagar ahora.`;
      },
    ),
  );

  server.registerTool(
    "cancelar_guia",
    {
      title: "Cancelar guía",
      description:
        "Cancela una guía que todavía no fue recogida. El pedido queda listo para generar otra. Pide confirm.",
      inputSchema: { guia: z.string(), confirm: z.boolean().default(false).optional() },
    },
    wrap(async ({ guia, confirm }: { guia: string; confirm?: boolean }) => {
      if (!confirm)
        return `Borrador: cancelaría la guía ${guia}. Solo se puede si aún no fue recogida. Llama de nuevo con confirm: true.`;
      const r = await api.post<Json>(`/api/shipments/${encodeURIComponent(guia)}/cancel`);
      return r.ok ? `Guía ${guia} cancelada.` : (r.message as string);
    }),
  );

  server.registerTool(
    "programar_recogida",
    {
      title: "Programar recogida",
      description: "Programa la recogida de una guía recién creada. Pide confirm.",
      inputSchema: { guia: z.string(), confirm: z.boolean().default(false).optional() },
    },
    wrap(async ({ guia, confirm }: { guia: string; confirm?: boolean }) => {
      if (!confirm)
        return `Borrador: programaría la recogida de ${guia} para mañana en la mañana. Llama de nuevo con confirm: true.`;
      const r = await api.post<Json>(`/api/shipments/${encodeURIComponent(guia)}/pickup`);
      return r.ok ? `Recogida de ${guia} programada.` : (r.message as string);
    }),
  );

  server.registerTool(
    "exportar_datos_cliente",
    {
      title: "Exportar datos de un cliente",
      description:
        "Devuelve los datos personales, pedidos y conversaciones de un cliente (derecho de acceso, Ley 1581).",
      inputSchema: { cliente_id: z.string() },
    },
    wrap(async ({ cliente_id }: { cliente_id: string }) => {
      const r = await api.get<Json>(`/api/customers/${encodeURIComponent(cliente_id)}/export`);
      const c = r.customer as Json;
      return `${c.name} · ${c.phone} · ${c.email ?? "sin correo"} · ${(c.orders as Json[]).length} pedidos · ${(c.conversations as Json[]).reduce((n, x) => n + (x.messages as Json[]).length, 0)} mensajes · consentimiento: ${c.whatsappConsent ? "sí" : "no"}${c.optOutAt ? " (pidió la baja)" : ""}.`;
    }),
  );

  server.registerTool(
    "borrar_datos_cliente",
    {
      title: "Borrar datos de un cliente",
      description:
        "Borra los datos personales de un cliente y sus conversaciones; los pedidos quedan sin datos personales. NO se puede deshacer: pide confirm.",
      inputSchema: { cliente_id: z.string(), confirm: z.boolean().default(false).optional() },
    },
    wrap(async ({ cliente_id, confirm }: { cliente_id: string; confirm?: boolean }) => {
      if (!confirm)
        return `Borrador: borraría nombre, teléfono, correo y conversaciones del cliente ${cliente_id}; sus pedidos quedan anonimizados. No se puede deshacer. Llama de nuevo con confirm: true.`;
      const r = await api.del<Json>(`/api/customers/${encodeURIComponent(cliente_id)}`);
      return r.ok
        ? `Datos borrados; ${r.anonymizedOrders} pedidos anonimizados.`
        : "No se pudo borrar.";
    }),
  );
}
