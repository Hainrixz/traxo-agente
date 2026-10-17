import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MockPayments, paymentsFromEnv, WompiPayments } from "../src/index.ts";

describe("pagos", () => {
  it("el simulador crea un link marcado como simulado", async () => {
    const l = await new MockPayments().createLink({
      orderId: "o1",
      amount: 95000,
      description: "Café",
    });
    expect(l.simulated).toBe(true);
    expect(l.url).toContain("pago.traxo.invalid");
  });
  it("Wompi manda el monto en centavos con Bearer y devuelve el link", async () => {
    let body: Record<string, unknown> = {};
    let auth = "";
    const f = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      auth = new Headers(init.headers).get("authorization") ?? "";
      return new Response(JSON.stringify({ data: { id: "abc123" } }), { status: 201 });
    }) as unknown as typeof fetch;
    const l = await new WompiPayments({ privateKey: "prv_x", fetch: f }).createLink({
      orderId: "o1",
      amount: 95000,
      description: "Café",
    });
    expect(body.amount_in_cents).toBe(9_500_000);
    expect(body.currency).toBe("COP");
    expect(auth).toBe("Bearer prv_x");
    expect(l.url).toContain("abc123");
  });
  it("traduce una llave inválida", async () => {
    const f = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    await expect(
      new WompiPayments({ privateKey: "mala", fetch: f }).createLink({
        orderId: "o",
        amount: 1,
        description: "x",
      }),
    ).rejects.toThrow("WOMPI_PRIVATE_KEY");
  });
  it("verifica la firma de eventos", () => {
    const w = new WompiPayments({ privateKey: "k", eventsSecret: "sec" });
    const data = { transaction: { id: "t1", status: "APPROVED", amount_in_cents: 100 } };
    const checksum = createHash("sha256").update(`t1APPROVED100${1700000000}sec`).digest("hex");
    const ev = {
      data,
      signature: {
        properties: ["transaction.id", "transaction.status", "transaction.amount_in_cents"],
        checksum,
      },
      timestamp: 1700000000,
    };
    expect(w.verifyEvent(ev)).toBe(true);
    expect(w.verifyEvent({ ...ev, timestamp: 1 })).toBe(false);
  });
  it("sin llave usa el simulador", () => {
    expect(paymentsFromEnv({}).name).toBe("mock");
    expect(paymentsFromEnv({ WOMPI_PRIVATE_KEY: "k" }).name).toBe("wompi");
  });
});
