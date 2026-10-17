import { type Db, openDb } from "@traxo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { askClaude, resetAiCounters } from "../src/ai.ts";
import { createRuntime, type Runtime } from "../src/runtime.ts";
import { costOf } from "../src/usage.ts";
import { buildUsage } from "../src/usage-api.ts";

let db: Db;
let rt: Runtime;

beforeAll(async () => {
  db = await openDb({ dataDir: "memory://" });
  rt = await createRuntime({}, { db });
}, 60_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await db.close?.();
});

describe("uso agéntico", () => {
  it("sin actividad todo es cero y el retorno es N/A (null), no inventado", async () => {
    const u = await buildUsage(db, rt.storeId, 30);
    expect(u.ai.calls).toBe(0);
    expect(u.cost.totalCop).toBe(0);
    expect(u.value.returnPerPeso).toBeNull();
    expect(u.value.automationPct).toBeNull();
    expect(u.series).toHaveLength(30);
  });

  it("anota los tokens reales de cada llamada a Claude y calcula el costo estimado", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    resetAiCounters();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          content: [{ type: "text", text: "hola" }],
          usage: { input_tokens: 1000, output_tokens: 200 },
        }),
      ),
    );
    const out = await askClaude(rt.storeId, {
      system: "s",
      user: "u",
      feature: "Asistente del panel",
    });
    expect(out).toBe("hola");
    await vi.waitFor(async () => {
      const u = await buildUsage(db, rt.storeId, 30);
      expect(u.ai.calls).toBe(1);
      expect(u.ai.tokensIn).toBe(1000);
      expect(u.ai.byFeature[0]?.feature).toBe("Asistente del panel");
    });
    // (1000×3 + 200×15) / 1e6 = 0,006 USD → 24 COP al cambio por defecto
    expect(
      Math.round(costOf({ kind: "ia", feature: "x", tokensIn: 1000, tokensOut: 200 }) * 4000),
    ).toBe(24);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("cuenta las acciones automáticas, los pasos humanos y el tiempo ahorrado", async () => {
    const now = new Date();
    const mk = (kind: string, i: number) => ({
      id: `r_${kind}_${i}`,
      storeId: rt.storeId,
      kind,
      summary: kind,
      at: now,
    });
    await db.prisma.agentRun.createMany({
      data: [
        ...[0, 1, 2].map((i) => mk("shipment.created", i)),
        ...[0, 1].map((i) => mk("quotes.received", i)),
        mk("approval.requested", 0),
        mk("error", 0),
      ],
    });
    const u = await buildUsage(db, rt.storeId, 30);
    expect(u.value.automatedActions).toBe(5);
    expect(u.value.humanSteps).toBe(1);
    expect(u.value.automationPct).toBe(83); // 5 de 6
    expect(u.value.hoursSaved).toBeCloseTo((3 * 5 + 2 * 6) / 60, 1);
    expect(u.actions.find((a) => a.kind === "shipment.created")?.count).toBe(3);
    expect(u.actions.some((a) => a.kind === "error")).toBe(false);
    expect(u.value.returnPerPeso).not.toBeNull();
  });

  it("separa los mensajes del agente por canal", async () => {
    const c = await db.prisma.customer.create({
      data: {
        id: "c_u1",
        storeId: rt.storeId,
        name: "Ana",
        phone: "+573001112233",
        email: null,
      } as never,
    });
    const conv = await db.prisma.conversation.create({
      data: { id: "cv_u1", storeId: rt.storeId, customerId: c.id, channel: "instagram" },
    });
    await db.prisma.message.createMany({
      data: [
        { id: "m_u1", conversationId: conv.id, direction: "out", text: "a", simulated: false },
        { id: "m_u2", conversationId: conv.id, direction: "in", text: "b", simulated: false },
      ],
    });
    const u = await buildUsage(db, rt.storeId, 30);
    expect(u.messages.byChannel.find((x) => x.channel === "instagram")?.sent).toBe(1);
  });
});
