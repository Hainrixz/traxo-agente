import { beforeEach, describe, expect, it } from "vitest";
import {
  BUILT_PAGES,
  checkEmbeddable,
  framedOrigins,
  resetEmbedCache,
} from "../src/built-pages.ts";

const url = BUILT_PAGES[0]?.url as string;
const resp = (init: ResponseInit & { body?: string }) => async () =>
  new Response(init.body ?? "ok", init);

beforeEach(() => resetEmbedCache());

describe("páginas construidas", () => {
  it("los datos salen de un solo lugar y son https", () => {
    expect(BUILT_PAGES.length).toBeGreaterThan(0);
    for (const p of BUILT_PAGES) {
      expect(p.url.startsWith("https://")).toBe(true);
      expect(p.shots.pc.startsWith("/paginas/")).toBe(true);
    }
    expect(framedOrigins()).toContain("https://claudio-dogs.vercel.app");
  });

  it("detecta si el sitio permite el marco", async () => {
    expect(await checkEmbeddable(url, resp({ status: 200 }) as never)).toBe(true);
    resetEmbedCache();
    expect(
      await checkEmbeddable(
        url,
        resp({ status: 200, headers: { "x-frame-options": "DENY" } }) as never,
      ),
    ).toBe(false);
    resetEmbedCache();
    expect(
      await checkEmbeddable(
        url,
        resp({
          status: 200,
          headers: { "content-security-policy": "frame-ancestors 'none'" },
        }) as never,
      ),
    ).toBe(false);
    resetEmbedCache();
    expect(
      await checkEmbeddable(url, (async () => {
        throw new Error("red");
      }) as never),
    ).toBe(false);
  });

  it("solo consulta URLs conocidas (no hace de proxy)", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("ok");
    }) as never;
    expect(await checkEmbeddable("https://evil.test/", spy)).toBe(false);
    expect(called).toBe(false);
  });
});
