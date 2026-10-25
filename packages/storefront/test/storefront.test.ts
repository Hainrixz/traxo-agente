// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildShopifyTheme,
  contrast,
  defaultDesign,
  lintTheme,
  paletteProblems,
  previewHtml,
  SECTION_IDS,
  STYLE_IDS,
  STYLES,
  StoreDesignSchema,
  zipFiles,
} from "../src/index.ts";

const products = [
  { title: "Café de Huila 500 g", price: 38000, imageUrl: "https://cdn.test/a.jpg" },
  { title: "Kit degustación", price: 89900 },
];

describe("diseño", () => {
  it("todos los estilos cumplen contraste AA (4,5:1)", () => {
    for (const id of STYLE_IDS) expect(paletteProblems(STYLES[id].palette), id).toEqual([]);
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("rechaza una paleta ilegible con un mensaje en español", () => {
    const d = defaultDesign({ brand: "Café", products });
    const bad = StoreDesignSchema.safeParse({
      ...d,
      palette: { ...d.palette, text: "#EEEEEE", bg: "#FFFFFF" },
    });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toContain("Poco contraste");
  });

  it("parte del catálogo real y no inventa reseñas ni cifras", () => {
    const d = defaultDesign({
      brand: "  Café   de Origen ",
      products,
      whatsapp: "+57 300 111 2233",
    });
    expect(d.brand).toBe("Café de Origen");
    expect(d.products[0]?.image).toBe("https://cdn.test/a.jpg");
    expect(d.products[1]?.image).toBeUndefined();
    expect(d.contact.whatsapp).toBe("573001112233");
    expect(JSON.stringify(d)).not.toMatch(/\d+ ?%|estrellas|★/);
  });

  it("sin contraentrega quita el banner y la pregunta de pago", () => {
    const d = defaultDesign({ brand: "X", cod: false });
    expect(d.sections).not.toContain("contraentrega");
    expect(d.copy.faq.some((f) => /pagar al recibir/i.test(f.q))).toBe(false);
  });
});

describe("tema de Shopify", () => {
  for (const style of STYLE_IDS) {
    it(`el tema «${style}» es coherente (JSON, secciones, snippets, assets, etiquetas)`, () => {
      const files = buildShopifyTheme(
        defaultDesign({ brand: "Café de Origen", style, products, whatsapp: "573001112233" }),
      );
      expect(lintTheme(files)).toEqual([]);
      for (const need of [
        "layout/theme.liquid",
        "templates/index.json",
        "templates/product.json",
        "assets/theme.css",
        "assets/theme.js",
      ])
        expect(files[need], need).toBeTruthy();
    });
  }

  it("la portada respeta el orden de las secciones elegidas", () => {
    const d = defaultDesign({ brand: "X", sections: ["productos", "hero", "faq"] });
    const files = buildShopifyTheme(d);
    // El orden de la página sigue el catálogo (portada primero), no el orden en que se marcaron.
    expect(JSON.parse(files["templates/index.json"] as string).order).toEqual([
      "hero",
      "productos",
      "faq",
    ]);
    expect(lintTheme(files)).toEqual([]);
  });

  it("WhatsApp es una sola sección flotante y solo si se eligió", () => {
    const withWa = buildShopifyTheme(defaultDesign({ brand: "X", whatsapp: "573001112233" }));
    expect(withWa["layout/theme.liquid"]).toContain("whatsapp-cta");
    expect(JSON.parse(withWa["templates/index.json"] as string).order).not.toContain("whatsapp");
    const without = buildShopifyTheme(
      defaultDesign({ brand: "X", sections: ["hero", "productos"] }),
    );
    expect(without["layout/theme.liquid"]).not.toContain("whatsapp-cta");
    expect(lintTheme(without)).toEqual([]);
  });

  it("el validador detecta un tema roto", () => {
    const files = buildShopifyTheme(defaultDesign({ brand: "X" }));
    files["sections/hero.liquid"] = "{% if x %}sin cerrar";
    delete files["snippets/price.liquid"];
    const p = lintTheme(files);
    expect(p.some((m) => m.includes("hero.liquid") && m.includes("abiertos"))).toBe(true);
    expect(p.some((m) => m.includes("price"))).toBe(true);
  });

  it("el CSS respeta movimiento reducido, foco visible y objetivos de 44 px", () => {
    const css = buildShopifyTheme(defaultDesign({ brand: "X" }))["assets/theme.css"] as string;
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("min-height:48px");
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).not.toMatch(/scale\(0\)/);
  });

  it("todas las secciones del catálogo existen como archivo", () => {
    const files = buildShopifyTheme(defaultDesign({ brand: "X", sections: [...SECTION_IDS] }));
    for (const t of [
      "hero",
      "benefits",
      "featured-products",
      "story",
      "social-proof",
      "cod-banner",
      "faq",
      "whatsapp-cta",
    ])
      expect(files[`sections/${t}.liquid`], t).toBeTruthy();
  });
});

describe("zip y vista previa", () => {
  it("el zip es válido: lo lee `unzip` y conserva los archivos", () => {
    const files = buildShopifyTheme(defaultDesign({ brand: "Café ñandú", products }));
    const dir = mkdtempSync(join(tmpdir(), "traxo-zip-"));
    try {
      const zip = join(dir, "tema.zip");
      writeFileSync(zip, zipFiles(files));
      const list = execFileSync("unzip", ["-l", zip]).toString();
      expect(list).toContain("layout/theme.liquid");
      expect(list).toContain(`${Object.keys(files).length} files`);
      const test = execFileSync("unzip", ["-t", zip]).toString();
      expect(test).toContain("No errors detected");
      const back = execFileSync("unzip", ["-p", zip, "config/settings_data.json"]).toString();
      expect(back).toBe(files["config/settings_data.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("el zip es determinista", () => {
    const f = buildShopifyTheme(defaultDesign({ brand: "X" }));
    expect(zipFiles(f).equals(zipFiles(f))).toBe(true);
  });

  it("la vista previa escapa el texto de la persona", () => {
    const d = defaultDesign({
      brand: "Tienda <script>alert(1)</script>",
      products: [{ title: '"><img src=x onerror=1>', price: 1000 }],
    });
    const html = previewHtml(d, { preview: true });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('"><img src=x');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Vista previa generada por Traxo");
  });

  it("solo acepta imágenes https", () => {
    const d = defaultDesign({
      brand: "X",
      products: [{ title: "a", price: 1, imageUrl: "javascript:alert(1)" }],
    });
    expect(d.products[0]?.image).toBeUndefined();
  });
});
