// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CampaignDraftInputSchema, formatCOP } from "@traxo/core";
import { z } from "zod";
import { TraxoApiError, type TraxoClient } from "./client.ts";

type Json = Record<string, any>;
export const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
export const fail = (e: unknown) => ({
  isError: true,
  content: [
    {
      type: "text" as const,
      text: e instanceof TraxoApiError ? e.message : `Algo falló: ${(e as Error).message}`,
    },
  ],
});
export const wrap =
  <A>(fn: (a: A) => Promise<string>) =>
  async (a: A) => {
    try {
      return ok(await fn(a));
    } catch (e) {
      return fail(e);
    }
  };

export const dias = (n: number) => `${n} ${n === 1 ? "día hábil" : "días hábiles"}`;
const payLabel = (p: string) => (p === "cod" ? "contraentrega" : "prepagado");

/** Registra las herramientas de Traxo. Las que escriben o gastan piden `confirm: true`: sin él devuelven un borrador. */
export function registerTools(server: McpServer, api: TraxoClient): void {
  server.registerTool(
    "traxo_estado",
    {
      title: "Estado de Traxo",
      description:
        "Resumen de la tienda: pedidos, envíos, novedades, aprobaciones pendientes, autonomía y qué conexiones son reales o simuladas.",
      inputSchema: {},
    },
    wrap(async () => {
      const s = await api.get<Json>("/api/state");
      const k = s.kpis;
      const conns = (s.connections as Json[])
        .map((c) => `- ${c.name}: ${c.live ? "real" : "simulado"}${c.note ? ` · ${c.note}` : ""}`)
        .join("\n");
      return [
        `Tienda: ${s.store.name} · base ${s.db === "pglite" ? "local (PGlite)" : "Postgres"} · autonomía ${s.settings.autonomy} (tope por guía ${formatCOP(s.settings.maxAutoShipmentCost)})`,
        `Pedidos ${k.orders} · envíos ${k.shipments} (${k.inTransit} en camino, ${k.delivered} entregados, ${k.incidents} con novedad)`,
        `Aprobaciones pendientes: ${k.pendingApprovals} · gasto en fletes: ${formatCOP(k.shippingSpend)}${k.simulatedShipments ? ` (${k.simulatedShipments} guías simuladas)` : ""}`,
        "Conexiones:",
        conns,
      ].join("\n");
    }),
  );

  server.registerTool(
    "listar_pedidos",
    {
      title: "Listar pedidos",
      description: "Últimos pedidos de la tienda con su estado y guía.",
      inputSchema: { limite: z.number().int().min(1).max(50).default(10).optional() },
    },
    wrap(async ({ limite }: { limite?: number }) => {
      const rows = await api.get<Json[]>("/api/orders");
      return (
        rows
          .slice(0, limite ?? 10)
          .map((o) => {
            const sh = o.shipments?.[0];
            return `${o.number} · ${(o.address as Json).name} · ${(o.address as Json).city} · ${formatCOP(o.total)} ${payLabel(o.payment)} · ${o.status}${sh ? ` · guía ${sh.trackingNumber} (${sh.carrier}, ${sh.status})` : ""}`;
          })
          .join("\n") || "No hay pedidos todavía."
      );
    }),
  );

  server.registerTool(
    "ver_pedido",
    {
      title: "Ver pedido",
      description:
        "Detalle de un pedido por número (#1042) o id: cliente, productos, cotizaciones y guía.",
      inputSchema: { pedido: z.string() },
    },
    wrap(async ({ pedido }: { pedido: string }) => {
      const r = await api.get<Json>(`/api/orders/${encodeURIComponent(pedido)}`);
      const o = r.order;
      const lines = (o.lines as Json[])
        .map((l) => `  · ${l.quantity} x ${l.title} (${formatCOP(l.unitPrice)})`)
        .join("\n");
      const quotes = (r.quotes as Json[])
        .filter((q) => q.chosen)
        .map(
          (q) =>
            `Elegida: ${q.carrier} por ${q.provider}, ${formatCOP(q.freight + q.codCommission)}, ${dias(q.businessDays)}`,
        )
        .join("\n");
      const ships = (r.shipments as Json[])
        .map(
          (s) =>
            `Guía ${s.trackingNumber} · ${s.carrier} · ${s.status}${s.simulated ? " (simulada)" : ""}\n${(s.events as Json[]).map((e) => `  - ${e.description}`).join("\n")}`,
        )
        .join("\n");
      return `${o.number} · ${o.address.name} · ${o.address.phone}\n${o.address.street}, ${o.address.city} (${o.address.department})\n${lines}\nTotal ${formatCOP(o.total)} ${payLabel(o.payment)}\n${quotes}\n${ships}`.trim();
    }),
  );

  server.registerTool(
    "cotizar_envio",
    {
      title: "Cotizar envío",
      description:
        "Cotiza un pedido en todas las vías conectadas y explica cuál conviene. No gasta nada ni crea guías.",
      inputSchema: { pedido: z.string() },
    },
    wrap(async ({ pedido }: { pedido: string }) => {
      const q = await api.get<Json>(`/api/orders/${encodeURIComponent(pedido)}/quote`);
      if (!q.explanation)
        return `Ninguna vía conectada llega a ${q.order.city}${q.codAmount ? " con contraentrega" : ""}.`;
      const rows = (q.ranking as Json[])
        .map(
          (r, i) =>
            `${i + 1}. ${r.carrier} (${r.provider}) · ${formatCOP(r.total)} · ${dias(r.businessDays)} · puntaje ${r.score}${r.simulated ? " · simulada" : ""}`,
        )
        .join("\n");
      const failed = (q.failed as string[]).length
        ? `\nNo cotizaron: ${(q.failed as string[]).join("; ")}`
        : "";
      return `${q.explanation}\n\n${rows}${failed}`;
    }),
  );

  server.registerTool(
    "crear_guia",
    {
      title: "Crear guía",
      description:
        "Genera la guía del pedido con la mejor opción, la escribe en la tienda y avisa al cliente. GASTA saldo de envío: sin confirm solo muestra el borrador.",
      inputSchema: { pedido: z.string(), confirm: z.boolean().default(false).optional() },
    },
    wrap(async ({ pedido, confirm }: { pedido: string; confirm?: boolean }) => {
      if (!confirm) {
        const q = await api.get<Json>(`/api/orders/${encodeURIComponent(pedido)}/quote`);
        if (!q.explanation) return "No hay cobertura para generar la guía.";
        return `Borrador: ${q.explanation}\nPara generar la guía (gasta saldo) vuelve a llamar con confirm: true.`;
      }
      const r = await api.post<Json>(`/api/orders/${encodeURIComponent(pedido)}/ship`);
      if (r.status === "already_shipped") return `Ese pedido ya tiene la guía ${r.trackingNumber}.`;
      if (r.status === "shipped")
        return `Listo: guía ${r.trackingNumber} con ${r.carrier}, escrita en la tienda y avisado el cliente.`;
      return `No pude generar la guía (${r.status}).`;
    }),
  );

  server.registerTool(
    "rastrear_guia",
    {
      title: "Rastrear guía",
      description: "Estado y eventos de una guía.",
      inputSchema: { guia: z.string() },
    },
    wrap(async ({ guia }: { guia: string }) => {
      const s = await api.get<Json>(`/api/shipments/${encodeURIComponent(guia)}`);
      return `Guía ${s.trackingNumber} · ${s.carrier} · ${s.status}${s.simulated ? " (simulada)" : ""}\nPedido ${s.order.number} → ${(s.order.address as Json).city}\n${(s.events as Json[]).map((e) => `- ${e.description} (${new Date(e.at).toLocaleString("es-CO")})`).join("\n")}`;
    }),
  );

  server.registerTool(
    "marcar_novedad",
    {
      title: "Marcar novedad",
      description:
        "Registra una novedad en una guía y hace que el agente contacte al cliente por WhatsApp. Escribe al cliente: sin confirm solo muestra qué haría.",
      inputSchema: {
        guia: z.string(),
        descripcion: z.string().default("Novedad reportada por la tienda").optional(),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async ({
        guia,
        descripcion,
        confirm,
      }: {
        guia: string;
        descripcion?: string;
        confirm?: boolean;
      }) => {
        if (!confirm)
          return `Borrador: marcaría la novedad "${descripcion ?? "Novedad reportada por la tienda"}" en la guía ${guia} y le escribiría al cliente por WhatsApp. Llama de nuevo con confirm: true.`;
        await api.post(`/api/shipments/${encodeURIComponent(guia)}/incident`, {
          description: descripcion,
        });
        return `Novedad registrada en ${guia} y cliente contactado.`;
      },
    ),
  );

  server.registerTool(
    "listar_aprobaciones",
    {
      title: "Listar aprobaciones",
      description:
        "Lo que el agente dejó esperando tu decisión (guías sobre el tope, direcciones, devoluciones, respuestas que no entendió).",
      inputSchema: {},
    },
    wrap(async () => {
      const rows = (await api.get<Json[]>("/api/approvals")).filter((a) => a.status === "pending");
      return (
        rows.map((a) => `${a.id} · ${a.kind} · ${a.title}\n   ${a.detail}`).join("\n") ||
        "No hay nada pendiente."
      );
    }),
  );

  server.registerTool(
    "resolver_aprobacion",
    {
      title: "Resolver aprobación",
      description:
        "Aprueba o rechaza una aprobación pendiente. Aprobar una guía GASTA saldo: pide confirm: true.",
      inputSchema: {
        id: z.string(),
        decision: z.enum(["aprobar", "rechazar"]),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async ({
        id,
        decision,
        confirm,
      }: {
        id: string;
        decision: "aprobar" | "rechazar";
        confirm?: boolean;
      }) => {
        if (decision === "aprobar" && !confirm)
          return `Borrador: aprobaría ${id} y ejecutaría lo que quedó preparado. Llama de nuevo con confirm: true.`;
        const r = await api.post<Json>(
          `/api/approvals/${encodeURIComponent(id)}/${decision === "aprobar" ? "approve" : "reject"}`,
        );
        return r.message as string;
      },
    ),
  );

  server.registerTool(
    "corregir_direccion",
    {
      title: "Corregir dirección",
      description:
        "Corrige la dirección de un pedido detenido (aprobación de tipo 'address') y retoma el envío.",
      inputSchema: {
        id: z.string(),
        direccion: z.string(),
        ciudad: z.string().optional(),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async ({
        id,
        direccion,
        ciudad,
        confirm,
      }: {
        id: string;
        direccion: string;
        ciudad?: string;
        confirm?: boolean;
      }) => {
        if (!confirm)
          return `Borrador: pondría "${direccion}"${ciudad ? ` en ${ciudad}` : ""} y retomaría el envío (puede generar la guía). Llama de nuevo con confirm: true.`;
        const r = await api.post<Json>(`/api/approvals/${encodeURIComponent(id)}/address`, {
          street: direccion,
          city: ciudad,
        });
        return r.message as string;
      },
    ),
  );

  server.registerTool(
    "enviar_whatsapp",
    {
      title: "Enviar WhatsApp",
      description: "Le escribe al cliente de un pedido. Sin confirm solo muestra el borrador.",
      inputSchema: {
        pedido: z.string(),
        texto: z.string().min(2),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async ({ pedido, texto, confirm }: { pedido: string; texto: string; confirm?: boolean }) => {
        if (!confirm)
          return `Borrador para el cliente de ${pedido}:\n"${texto}"\nLlama de nuevo con confirm: true para enviarlo.`;
        const r = await api.post<Json>("/api/messages", { orderKey: pedido, text: texto });
        return r.simulated
          ? "Mensaje enviado (simulado: falta ZERNIO_API_KEY)."
          : "Mensaje enviado por WhatsApp.";
      },
    ),
  );

  server.registerTool(
    "listar_productos",
    {
      title: "Productos",
      description:
        "Catálogo con unidades vendidas, ingresos y margen. El margen sale N/A si la tienda no cargó el costo.",
      inputSchema: {},
    },
    wrap(async () => {
      const rows = await api.get<Json[]>("/api/products");
      return rows
        .map(
          (p) =>
            `${p.title} · ${formatCOP(p.price)} · vendidos ${p.unitsSold} (${formatCOP(p.revenue)}) · margen ${p.marginPct == null ? "N/A (falta el costo)" : `${p.marginPct}%`}`,
        )
        .join("\n");
    }),
  );

  server.registerTool(
    "segmentar_clientes",
    {
      title: "Segmentar clientes",
      description:
        "Clientes de la base con sus segmentos (recompra, nuevo, inactivo, sin consentimiento de WhatsApp). Solo se les escribe a quienes dieron consentimiento.",
      inputSchema: {
        segmento: z.enum(["recompra", "nuevo", "inactivo", "sin_consentimiento"]).optional(),
      },
    },
    wrap(async ({ segmento }: { segmento?: string }) => {
      const r = await api.get<Json>("/api/customers");
      const list = (r.customers as Json[]).filter(
        (c) => !segmento || (c.segments as string[]).includes(segmento),
      );
      const head = `Base: ${r.total} clientes · recompra ${r.segments.recompra} · nuevos ${r.segments.nuevo} · inactivos ${r.segments.inactivo} · sin consentimiento ${r.segments.sin_consentimiento}`;
      return `${head}\n${list
        .slice(0, 25)
        .map(
          (c) =>
            `${c.name} · ${c.phone} · ${c.city ?? "—"} · ${c.orders} pedidos · ${formatCOP(c.spent)} · ${(c.segments as string[]).join(", ") || "—"}`,
        )
        .join("\n")}`;
    }),
  );

  server.registerTool(
    "crear_borrador_campana",
    {
      title: "Crear borrador de campaña",
      description:
        "Guarda un borrador de campaña (Meta, Google o TikTok) con presupuesto, público, copy y prompts de creativos. Es LOCAL: no crea nada en la plataforma, no gasta y nunca queda activa. Valida los límites de caracteres.",
      inputSchema: CampaignDraftInputSchema.shape,
    },
    wrap(async (input: unknown) => {
      const r = await api.post<Json>("/api/campaigns", input);
      return `Borrador ${r.id} guardado (${r.status}). Para verlo: exportar_borrador. Crearlo en la plataforma es otro paso y pide tu sí.`;
    }),
  );

  server.registerTool(
    "listar_borradores",
    {
      title: "Borradores de campaña",
      description: "Borradores de campaña guardados y su estado.",
      inputSchema: {},
    },
    wrap(async () => {
      const rows = await api.get<Json[]>("/api/campaigns");
      return (
        rows
          .map(
            (r) =>
              `${r.id} · ${r.platform} · ${r.product} · ${r.status}${r.externalId ? ` · id plataforma ${r.externalId}` : ""}`,
          )
          .join("\n") || "No hay borradores."
      );
    }),
  );

  server.registerTool(
    "exportar_borrador",
    {
      title: "Exportar borrador",
      description: "El borrador de campaña en Markdown, listo para copiar a la plataforma.",
      inputSchema: { id: z.string() },
    },
    wrap(
      async ({ id }: { id: string }) =>
        (await api.get<Json>(`/api/campaigns/${encodeURIComponent(id)}/markdown`))
          .markdown as string,
    ),
  );

  server.registerTool(
    "registrar_campana_creada",
    {
      title: "Registrar campaña creada",
      description:
        "Úsala después de crear la campaña en la plataforma. Solo se marca PAUSED si verificaste el estado de pausa que devolvió la plataforma (pausa_verificada: true); si no, avisa que hay que pausarla a mano.",
      inputSchema: { id: z.string(), id_plataforma: z.string(), pausa_verificada: z.boolean() },
    },
    wrap(
      async ({
        id,
        id_plataforma,
        pausa_verificada,
      }: {
        id: string;
        id_plataforma: string;
        pausa_verificada: boolean;
      }) => {
        const r = await api.post<Json>(`/api/campaigns/${encodeURIComponent(id)}/mark-created`, {
          externalId: id_plataforma,
          verifiedPaused: pausa_verificada,
        });
        return r.ok ? `Registrada en pausa (${id_plataforma}).` : `ATENCIÓN: ${r.message}`;
      },
    ),
  );

  server.registerTool(
    "listar_conversaciones",
    {
      title: "Conversaciones",
      description: "Últimas conversaciones con clientes.",
      inputSchema: {},
    },
    wrap(async () => {
      const rows = await api.get<Json[]>("/api/conversations");
      return (
        rows
          .map(
            (c) =>
              `${c.customer.name} (${c.customer.phone})\n${(c.messages as Json[])
                .slice(-4)
                .map((m) => `  ${m.direction === "in" ? "←" : "→"} ${m.text}`)
                .join("\n")}`,
          )
          .join("\n\n") || "Todavía no hay conversaciones."
      );
    }),
  );

  server.registerTool(
    "ver_actividad",
    {
      title: "Actividad del agente",
      description: "Lo que el agente ha hecho últimamente, en orden.",
      inputSchema: { limite: z.number().int().min(1).max(100).default(20).optional() },
    },
    wrap(async ({ limite }: { limite?: number }) => {
      const ev = await api.get<Json[]>("/api/events");
      return (
        ev
          .slice(-(limite ?? 20))
          .map((e) => `${new Date(e.at).toLocaleTimeString("es-CO")} · ${e.summary}`)
          .join("\n") || "Sin actividad."
      );
    }),
  );

  server.registerTool(
    "configurar_autonomia",
    {
      title: "Configurar autonomía",
      description:
        "Nivel 0 = todo con aprobación; nivel 1 = guías, tracking y avisos automáticos (los anuncios y los créditos siempre piden aprobación). Cambia cómo actúa el agente: pide confirm.",
      inputSchema: {
        nivel: z.union([z.literal(0), z.literal(1)]),
        tope_guia: z.number().int().positive().optional(),
        confirm: z.boolean().default(false).optional(),
      },
    },
    wrap(
      async ({
        nivel,
        tope_guia,
        confirm,
      }: {
        nivel: 0 | 1;
        tope_guia?: number;
        confirm?: boolean;
      }) => {
        if (!confirm)
          return `Borrador: autonomía ${nivel}${tope_guia ? ` y tope por guía ${formatCOP(tope_guia)}` : ""}. Llama de nuevo con confirm: true.`;
        const s = await api.post<Json>("/api/settings", {
          autonomy: nivel,
          ...(tope_guia ? { maxAutoShipmentCost: tope_guia } : {}),
        });
        return `Listo: autonomía ${s.autonomy}, tope por guía ${formatCOP(s.maxAutoShipmentCost)}.`;
      },
    ),
  );

  server.registerTool(
    "demo_simular_pedido",
    {
      title: "Demo: simular pedido",
      description:
        "Solo en modo demo: hace llegar un pedido de ejemplo y deja que el agente lo procese.",
      inputSchema: {
        dane: z
          .string()
          .regex(/^\d{5}$/)
          .optional(),
        direccion_mala: z.boolean().optional(),
      },
    },
    wrap(async ({ dane, direccion_mala }: { dane?: string; direccion_mala?: boolean }) => {
      const r = await api.post<Json>("/api/demo/order", { dane, badAddress: direccion_mala });
      return `Pedido ${r.number} simulado → ${JSON.stringify(r.outcome)}`;
    }),
  );
}
