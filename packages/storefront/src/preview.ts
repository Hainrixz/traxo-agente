import { BASE_CSS, tokensCss } from "./css.ts";
import type { StoreDesign } from "./design.ts";

const esc = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
const cop = (n: number): string => `$ ${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const GRADIENTS = [
  ["#e8d5b7", "#c9a27a"],
  ["#cfd8dc", "#90a4ae"],
  ["#f3d9d0", "#d9a08f"],
  ["#d5e3cf", "#9cb98f"],
];

function art(i: number, label: string): string {
  const [a, b] = GRADIENTS[i % GRADIENTS.length] as [string, string];
  return `<svg viewBox="0 0 400 500" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="500" fill="url(#g${i})"/><circle cx="200" cy="230" r="78" fill="#fff" opacity=".55"/></svg>`;
}

function sectionHtml(id: string, d: StoreDesign): string {
  switch (id) {
    case "hero":
      return `<section class="hero"><div class="container hero-grid"><div>${d.tagline ? `<p class="eyebrow">${esc(d.tagline)}</p>` : ""}<h1>${esc(d.copy.headline)}</h1>${d.copy.sub ? `<p class="lead">${esc(d.copy.sub)}</p>` : ""}<div class="actions"><a class="btn" href="#productos">${esc(d.copy.cta)}</a></div></div></div></section>`;
    case "beneficios":
      return `<section class="section"><div class="container"><div class="benefits-grid">${d.copy.benefits.map((b) => `<div class="benefit"><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`).join("")}</div></div></section>`;
    case "productos":
      return `<section class="section" id="productos"><div class="container"><div class="section-head"><h2>Lo más pedido</h2><a href="#productos">Ver todo</a></div><div class="grid">${
        d.products.length
          ? d.products
              .slice(0, 8)
              .map(
                (p, i) =>
                  `<article class="card"><a class="card-media" href="#productos" tabindex="-1" aria-hidden="true">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : art(i, p.title)}</a><div class="card-body"><h3><a href="#productos">${esc(p.title)}</a></h3><p class="price"><span>${cop(p.price)}</span></p></div></article>`,
              )
              .join("")
          : `<p class="placeholder">Cuando conectes tu tienda, aquí van tus productos reales.</p>`
      }</div></div></section>`;
    case "historia":
      return `<section class="section"><div class="container story"><h2>Nuestra historia</h2>${d.copy.story ? `<p>${esc(d.copy.story)}</p>` : `<p class="placeholder">Cuenta aquí quién está detrás de la marca y por qué haces lo que haces.</p>`}</div></section>`;
    case "prueba-social":
      return `<section class="section"><div class="container"><h2>Lo que dicen nuestros clientes</h2><p class="placeholder">Pega aquí reseñas reales de tus clientes: nombre y ciudad. Traxo no inventa testimonios.</p></div></section>`;
    case "contraentrega":
      return `<section class="section"><div class="container"><div class="cod"><h2>Paga cuando recibes</h2><p>Contraentrega en las ciudades con cobertura. Confirmas por WhatsApp y pagas al recibir.</p></div></div></section>`;
    case "faq":
      return `<section class="section"><div class="container faq"><h2>Preguntas frecuentes</h2>${d.copy.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}</div></section>`;
    default:
      return "";
  }
}

/** Página única y autosuficiente con la portada del diseño. Sirve de vista previa y de sitio estático para otras plataformas. */
export function previewHtml(d: StoreDesign, opts: { preview?: boolean } = {}): string {
  const body = d.sections.map((s) => sectionHtml(s, d)).join("\n");
  const wa =
    d.sections.includes("whatsapp") && d.contact.whatsapp
      ? `<a class="wa-float" href="https://wa.me/${esc(d.contact.whatsapp)}" rel="noopener">Escríbenos</a>`
      : "";
  const fonts = [d.fonts.heading, d.fonts.body]
    .filter((f, i, a) => a.indexOf(f) === i)
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`)
    .join("&");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.brand)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">
<style>${tokensCss(d)}
${BASE_CSS}</style>
</head>
<body>
<header class="site-header"><div class="container header-row"><a class="brand" href="#">${esc(d.brand)}</a><nav class="nav" aria-label="Principal"><a href="#productos">Productos</a><a href="#">Contacto</a></nav><span class="cart-link" aria-label="Carrito"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg><span class="cart-count">0</span></span></div></header>
<main>
${body}
</main>
<footer class="site-footer"><div class="container footer-row"><strong>${esc(d.brand)}</strong><span>${opts.preview ? "Vista previa generada por Traxo" : `© ${new Date().getFullYear()} ${esc(d.brand)}`}</span></div></footer>
${wa}
</body>
</html>
`;
}
