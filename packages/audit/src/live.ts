import { type Fetched, safeGet } from "./safe-fetch.ts";
import { type AuditReport, buildReport, type Check } from "./types.ts";

type Opts = Parameters<typeof safeGet>[1];

const attr = (tag: string, name: string): string | undefined =>
  new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(tag)?.[1];
const metaContent = (html: string, key: string): string | undefined => {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if ((attr(tag, "name") ?? attr(tag, "property"))?.toLowerCase() === key)
      return attr(tag, "content");
  }
  return undefined;
};
const tags = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => m[0]);
const text = (html: string, name: string): string[] =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "gi"))].map((m) =>
    (m[1] ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
const pct = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100));

const mk = (
  id: string,
  group: string,
  title: string,
  status: Check["status"],
  impact: Check["impact"],
  evidence: string,
  fix?: string,
): Check => ({ id, group, title, status, impact, evidence, fix });

export function seoChecks(
  page: Fetched,
  robots: Fetched | undefined,
  sitemap: Fetched | undefined,
  llms: Fetched | undefined,
): Check[] {
  const html = page.body;
  const out: Check[] = [];
  out.push(
    mk(
      "https",
      "Técnico",
      "Conexión segura (HTTPS)",
      page.url.startsWith("https://") ? "pass" : "fail",
      "alto",
      page.url,
      "Activa HTTPS: sin él Google y los navegadores penalizan la tienda.",
    ),
  );
  out.push(
    mk(
      "status",
      "Técnico",
      "La página responde bien",
      page.status === 200 ? "pass" : "fail",
      "alto",
      `HTTP ${page.status}`,
      "La página principal debe responder 200.",
    ),
  );
  const title = text(html, "title")[0];
  out.push(
    !title
      ? mk(
          "title",
          "Contenido",
          "Título de la página",
          "fail",
          "alto",
          "No hay <title>.",
          "Escribe un título de 30 a 65 caracteres con la palabra clave principal.",
        )
      : mk(
          "title",
          "Contenido",
          "Título de la página",
          title.length >= 30 && title.length <= 65 ? "pass" : "warn",
          "alto",
          `${title.length} caracteres: «${title.slice(0, 70)}»`,
          "Ajústalo a 30–65 caracteres.",
        ),
  );
  const desc = metaContent(html, "description");
  out.push(
    !desc
      ? mk(
          "desc",
          "Contenido",
          "Meta descripción",
          "fail",
          "alto",
          "No hay meta description.",
          "Escribe 70–160 caracteres que inviten a hacer clic.",
        )
      : mk(
          "desc",
          "Contenido",
          "Meta descripción",
          desc.length >= 70 && desc.length <= 165 ? "pass" : "warn",
          "alto",
          `${desc.length} caracteres`,
          "Ajústala a 70–160 caracteres.",
        ),
  );
  const h1 = text(html, "h1");
  out.push(
    mk(
      "h1",
      "Contenido",
      "Un solo H1",
      h1.length === 1 ? "pass" : h1.length === 0 ? "fail" : "warn",
      "medio",
      `${h1.length} H1${h1[0] ? `: «${h1[0].slice(0, 50)}»` : ""}`,
      "Deja un único H1 que diga qué vende la página.",
    ),
  );
  out.push(
    mk(
      "canonical",
      "Técnico",
      "URL canónica",
      /<link\b[^>]*rel=["']canonical["']/i.test(html) ? "pass" : "warn",
      "medio",
      /<link\b[^>]*rel=["']canonical["']/i.test(html) ? "Presente" : "No se encontró",
      'Añade <link rel="canonical"> para evitar contenido duplicado.',
    ),
  );
  const lang = /<html\b[^>]*\blang=["']([^"']+)["']/i.exec(html)?.[1];
  out.push(
    mk(
      "lang",
      "Técnico",
      "Idioma declarado",
      !lang ? "fail" : lang.toLowerCase().startsWith("es") ? "pass" : "warn",
      "bajo",
      lang ? `lang="${lang}"` : "No hay atributo lang",
      'Declara lang="es-CO" en <html>.',
    ),
  );
  out.push(
    mk(
      "viewport",
      "Técnico",
      "Viewport para móvil",
      metaContent(html, "viewport") ? "pass" : "fail",
      "alto",
      metaContent(html, "viewport") ?? "No hay meta viewport",
      'Añade <meta name="viewport" content="width=device-width, initial-scale=1">.',
    ),
  );
  out.push(
    mk(
      "noindex",
      "Técnico",
      "Indexable (sin noindex)",
      /noindex/i.test(metaContent(html, "robots") ?? "") ? "fail" : "pass",
      "alto",
      metaContent(html, "robots") ?? "Sin etiqueta robots",
      "Quita el noindex si quieres aparecer en Google.",
    ),
  );
  const og = metaContent(html, "og:title") && metaContent(html, "og:image");
  out.push(
    mk(
      "og",
      "Redes",
      "Vista previa al compartir (Open Graph)",
      og ? "pass" : "warn",
      "medio",
      og ? "og:title y og:image" : "Falta og:title u og:image",
      "Añade og:title y og:image para que el enlace se vea bien en WhatsApp e Instagram.",
    ),
  );
  const imgs = tags(html, "img");
  const withAlt = imgs.filter((t) => (attr(t, "alt") ?? "").trim().length > 0).length;
  out.push(
    imgs.length === 0
      ? mk(
          "alt",
          "Contenido",
          "Imágenes con texto alternativo",
          "na",
          "medio",
          "La página no tiene <img> en el HTML inicial.",
        )
      : mk(
          "alt",
          "Contenido",
          "Imágenes con texto alternativo",
          pct(withAlt, imgs.length) >= 90
            ? "pass"
            : pct(withAlt, imgs.length) >= 60
              ? "warn"
              : "fail",
          "medio",
          `${withAlt} de ${imgs.length} (${pct(withAlt, imgs.length)} %)`,
          "Describe cada imagen de producto en el alt.",
        ),
  );
  const ld = [
    ...html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi),
  ].map((m) => m[1] ?? "");
  const hasProduct = ld.some((j) => /"@type"\s*:\s*"?(Product|Offer)/i.test(j));
  out.push(
    mk(
      "schema",
      "Datos estructurados",
      "Schema de producto (JSON-LD)",
      hasProduct ? "pass" : ld.length ? "warn" : "fail",
      "alto",
      hasProduct
        ? "Product/Offer encontrado"
        : ld.length
          ? `${ld.length} bloque(s) JSON-LD, ninguno de producto`
          : "Sin JSON-LD",
      "Añade Product con offers (precio, moneda COP, disponibilidad).",
    ),
  );
  out.push(
    mk(
      "robots",
      "Rastreo",
      "robots.txt",
      robots?.status === 200 ? "pass" : "warn",
      "medio",
      robots ? `HTTP ${robots.status}` : "No se pudo consultar",
      "Publica /robots.txt.",
    ),
  );
  out.push(
    mk(
      "sitemap",
      "Rastreo",
      "sitemap.xml",
      sitemap?.status === 200 && /<urlset|<sitemapindex/i.test(sitemap.body) ? "pass" : "warn",
      "medio",
      sitemap ? `HTTP ${sitemap.status}` : "No se pudo consultar",
      "Publica /sitemap.xml y envíalo a Search Console.",
    ),
  );
  out.push(
    mk(
      "llms",
      "Visibilidad en IA",
      "llms.txt para asistentes de IA",
      llms?.status === 200 ? "pass" : "warn",
      "bajo",
      llms ? `HTTP ${llms.status}` : "No se pudo consultar",
      "Opcional: publica /llms.txt resumiendo tu catálogo.",
    ),
  );
  out.push(
    mk(
      "cwv",
      "Rendimiento",
      "Core Web Vitals (LCP, CLS, INP)",
      "na",
      "alto",
      "Requiere medir en un navegador real; esta auditoría solo lee el HTML.",
      "Mídelo con PageSpeed Insights.",
    ),
  );
  return out;
}

export function designChecks(page: Fetched): Check[] {
  const html = page.body;
  const out: Check[] = [];
  out.push(
    mk(
      "viewport",
      "Móvil",
      "Se adapta al teléfono (viewport)",
      metaContent(html, "viewport") ? "pass" : "fail",
      "alto",
      metaContent(html, "viewport") ?? "No hay meta viewport",
      "Añade el meta viewport.",
    ),
  );
  const imgs = tags(html, "img");
  const lazy = imgs.filter((t) => /loading=["']lazy["']/i.test(t)).length;
  out.push(
    imgs.length < 3
      ? mk(
          "lazy",
          "Rendimiento",
          "Imágenes con carga diferida",
          "na",
          "medio",
          "Hay pocas imágenes en el HTML inicial.",
        )
      : mk(
          "lazy",
          "Rendimiento",
          "Imágenes con carga diferida",
          pct(lazy, imgs.length) >= 60 ? "pass" : "warn",
          "medio",
          `${lazy} de ${imgs.length} usan loading="lazy"`,
          'Añade loading="lazy" a las imágenes bajo el primer pantallazo.',
        ),
  );
  const sized = imgs.filter((t) => attr(t, "width") && attr(t, "height")).length;
  out.push(
    imgs.length === 0
      ? mk(
          "dims",
          "Estabilidad",
          "Imágenes con ancho y alto (evita saltos)",
          "na",
          "medio",
          "Sin imágenes en el HTML inicial.",
        )
      : mk(
          "dims",
          "Estabilidad",
          "Imágenes con ancho y alto (evita saltos)",
          pct(sized, imgs.length) >= 80 ? "pass" : "warn",
          "medio",
          `${sized} de ${imgs.length} traen width y height`,
          "Declara width y height para que la página no se mueva al cargar.",
        ),
  );
  out.push(
    mk(
      "favicon",
      "Marca",
      "Favicon",
      /rel=["'](shortcut )?icon["']/i.test(html) ? "pass" : "warn",
      "bajo",
      /rel=["'](shortcut )?icon["']/i.test(html) ? "Presente" : "No se encontró",
      "Añade un favicon.",
    ),
  );
  const plain = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  out.push(
    mk(
      "cta",
      "Conversión",
      "Botón de compra visible",
      /(comprar|agregar al carrito|añadir al carrito|add to cart|buy now)/i.test(plain)
        ? "pass"
        : "fail",
      "alto",
      /(comprar|agregar al carrito|añadir al carrito|add to cart|buy now)/i.test(plain)
        ? "Se encontró un llamado a comprar"
        : "No se encontró «Comprar» ni «Agregar al carrito»",
      "Pon un botón de compra claro en el primer pantallazo.",
    ),
  );
  const trust = /(env[ií]o|devoluci|garant[ií]a|contraentrega|contra entrega|pago seguro)/i.test(
    plain,
  );
  out.push(
    mk(
      "trust",
      "Confianza",
      "Envío, devoluciones o contraentrega a la vista",
      trust ? "pass" : "warn",
      "alto",
      trust ? "Menciona envío, devoluciones o contraentrega" : "No se mencionan",
      "Di cuánto tarda el envío y si hay contraentrega: en Colombia sube la conversión.",
    ),
  );
  out.push(
    mk(
      "wa",
      "Confianza",
      "Contacto por WhatsApp",
      /(wa\.me|api\.whatsapp\.com|whatsapp:\/\/)/i.test(html) ? "pass" : "warn",
      "medio",
      /(wa\.me|api\.whatsapp\.com)/i.test(html)
        ? "Enlace de WhatsApp presente"
        : "Sin enlace de WhatsApp",
      "Añade un botón de WhatsApp: es el canal de soporte que más se usa.",
    ),
  );
  out.push(
    mk(
      "cop",
      "Precios",
      "Precios en pesos colombianos",
      /(\$\s?\d{1,3}(\.\d{3})+|COP)/.test(plain) ? "pass" : "warn",
      "medio",
      /(\$\s?\d{1,3}(\.\d{3})+|COP)/.test(plain)
        ? "Precios con formato COP"
        : "No se encontró un precio con formato $ 125.000",
      "Muestra el precio como $ 125.000.",
    ),
  );
  const kb = Math.round(Buffer.byteLength(html) / 1024);
  out.push(
    mk(
      "weight",
      "Rendimiento",
      "Peso del HTML",
      kb <= 300 ? "pass" : "warn",
      "bajo",
      `${kb} KB${page.truncated ? " (leído hasta el tope)" : ""}`,
      "Reduce el HTML: menos de 300 KB.",
    ),
  );
  const ext = tags(html, "script").filter((t) => /\bsrc=/.test(t)).length;
  out.push(
    mk(
      "scripts",
      "Rendimiento",
      "Scripts externos",
      ext <= 15 ? "pass" : "warn",
      "medio",
      `${ext} scripts con src`,
      "Quita apps y píxeles que no uses.",
    ),
  );
  out.push(
    mk(
      "contrast",
      "Accesibilidad",
      "Contraste y legibilidad del texto",
      "na",
      "alto",
      "Requiere renderizar la página; esta auditoría solo lee el HTML.",
      "Revísalo con Lighthouse.",
    ),
  );
  out.push(
    mk(
      "mobilenav",
      "Móvil",
      "Navegación cómoda en el teléfono",
      "na",
      "medio",
      "Requiere probar en un teléfono real.",
      "Abre la tienda en tu celular y compra algo.",
    ),
  );
  return out;
}

/** Audita una URL real. Solo lee HTML público (sin ejecutar JavaScript) y lo dice en las notas. */
export async function auditUrl(
  kind: "seo" | "diseno",
  url: string,
  opts: Opts = {},
): Promise<AuditReport> {
  const page = await safeGet(url, opts);
  const origin = new URL(page.url).origin;
  const side = async (path: string): Promise<Fetched | undefined> =>
    safeGet(`${origin}${path}`, { ...opts, maxBytes: 300_000 }).catch(() => undefined);
  const notes = [
    "Se lee el HTML público de la página principal; no se ejecuta JavaScript ni se mide rendimiento real.",
    ...(page.truncated ? ["La página es muy grande: se leyó hasta el tope de 1,5 MB."] : []),
  ];
  if (kind === "seo") {
    const [robots, sitemap, llms] = await Promise.all([
      side("/robots.txt"),
      side("/sitemap.xml"),
      side("/llms.txt"),
    ]);
    return buildReport("seo", "live", page.url, seoChecks(page, robots, sitemap, llms), notes);
  }
  return buildReport("diseno", "live", page.url, designChecks(page), notes);
}
