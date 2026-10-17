import type { StoreDesign } from "./design.ts";

/**
 * Estilos del tema. Reglas de movimiento: solo transform y opacity, menos de 300 ms, curva ease-out fuerte,
 * respuesta inmediata al presionar (scale .97), sin escalar desde 0 y todo apagado con «reducir movimiento».
 * Los colores y fuentes vienen de variables, así el editor de Shopify los puede cambiar sin tocar código.
 */
export const BASE_CSS = `*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:1rem;line-height:1.6;-webkit-font-smoothing:antialiased}
img,svg,video{max-width:100%;height:auto;display:block}
a{color:inherit}
h1,h2,h3{font-family:var(--font-heading);line-height:1.12;margin:0 0 .5em;font-weight:700;letter-spacing:-.015em;text-wrap:balance}
h1{font-size:clamp(2.1rem,6vw,3.6rem);letter-spacing:-.025em}
h2{font-size:clamp(1.6rem,3.6vw,2.3rem)}
h3{font-size:1.15rem;letter-spacing:-.005em}
p{margin:0 0 1em;text-wrap:pretty}
:root{--ease:cubic-bezier(.23,1,.32,1);--radius:14px;--gap:clamp(16px,3vw,28px);--line:color-mix(in srgb,var(--text) 14%,transparent)}
.container{width:min(1120px,100% - 32px);margin-inline:auto}
.section{padding-block:clamp(40px,8vw,88px)}
.eyebrow{font-size:.8rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 .75rem}
.lead{font-size:clamp(1.05rem,2vw,1.2rem);color:var(--muted);max-width:56ch}
.skip{position:absolute;left:12px;top:-60px;background:var(--accent);color:var(--accent-text);padding:10px 14px;border-radius:10px;z-index:100;transition:transform .16s var(--ease)}
.skip:focus{top:12px}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 24px;border:0;border-radius:999px;background:var(--accent);color:var(--accent-text);font:600 1rem var(--font-body);text-decoration:none;cursor:pointer;transition:transform .16s var(--ease),opacity .16s var(--ease)}
.btn:active{transform:scale(.97)}
.btn[disabled]{opacity:.5;cursor:not-allowed}
.btn.ghost{background:transparent;color:var(--text);box-shadow:inset 0 0 0 1.5px var(--line)}
@media (hover:hover){.btn:hover{opacity:.9}}
.site-header{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border-bottom:1px solid var(--line)}
.header-row{display:flex;align-items:center;gap:20px;min-height:64px}
.brand{font:700 1.25rem var(--font-heading);text-decoration:none;letter-spacing:-.02em}
.brand img{max-height:36px;width:auto}
.nav{display:flex;gap:4px;margin-left:auto;overflow-x:auto;scrollbar-width:none}
.nav a{padding:10px 12px;border-radius:10px;text-decoration:none;color:var(--muted);font-weight:500;white-space:nowrap;min-height:44px;display:inline-flex;align-items:center}
.nav a[aria-current="page"]{color:var(--text)}
@media (hover:hover){.nav a:hover{color:var(--text)}}
.cart-link{position:relative;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:999px;text-decoration:none;transition:transform .16s var(--ease)}
.cart-link:active{transform:scale(.94)}
.cart-count{position:absolute;top:2px;right:0;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--accent);color:var(--accent-text);font-size:.72rem;font-weight:700;display:grid;place-items:center}
.hero{padding-block:clamp(40px,9vw,110px)}
.hero-grid{display:grid;gap:var(--gap);align-items:center}
@media (min-width:860px){.hero-grid.has-media{grid-template-columns:1.05fr .95fr}}
.hero-media{border-radius:calc(var(--radius) + 6px);overflow:hidden;background:var(--surface);aspect-ratio:4/5}
.hero-media img{width:100%;height:100%;object-fit:cover}
.hero .actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:1.5rem}
.benefits-grid{display:grid;gap:var(--gap);grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.benefit{padding:22px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line)}
.benefit h3{margin-bottom:.35em}
.benefit p{margin:0;color:var(--muted)}
.grid{display:grid;gap:var(--gap);grid-template-columns:repeat(2,1fr)}
@media (min-width:760px){.grid{grid-template-columns:repeat(3,1fr)}}
@media (min-width:1040px){.grid{grid-template-columns:repeat(4,1fr)}}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:clamp(20px,4vw,36px)}
.section-head h2{margin:0}
.card{display:flex;flex-direction:column;gap:12px}
.card-media{display:block;aspect-ratio:4/5;border-radius:var(--radius);overflow:hidden;background:var(--surface);transition:transform .22s var(--ease)}
.card-media img,.card-media svg{width:100%;height:100%;object-fit:cover}
@media (hover:hover){.card-media:hover{transform:translateY(-3px)}}
.card-media:active{transform:scale(.985)}
.card-body h3{margin:0 0 .15em;font-size:1rem;font-weight:600;font-family:var(--font-body)}
.card-body h3 a{text-decoration:none}
.price{margin:0;color:var(--muted);font-variant-numeric:tabular-nums}
.price s{opacity:.7;margin-right:6px}
.price span{color:var(--text);font-weight:600}
.story{display:grid;gap:var(--gap)}
.story p{font-size:1.1rem;max-width:62ch}
.placeholder{padding:28px;border:1.5px dashed var(--line);border-radius:var(--radius);color:var(--muted);text-align:center}
.reviews{display:grid;gap:var(--gap);grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.review{padding:24px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line)}
.review blockquote{margin:0 0 12px;font-size:1.05rem}
.review cite{color:var(--muted);font-style:normal;font-size:.92rem}
.cod{background:var(--accent);color:var(--accent-text);border-radius:calc(var(--radius) + 6px);padding:clamp(24px,5vw,44px);display:grid;gap:8px}
.cod h2,.cod p{margin:0;color:inherit}
.cod p{opacity:.92;max-width:58ch}
.faq details{border-bottom:1px solid var(--line)}
.faq summary{cursor:pointer;list-style:none;padding:18px 0;font-weight:600;display:flex;justify-content:space-between;gap:16px;min-height:44px;align-items:center}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:1.4rem;line-height:1;transition:transform .2s var(--ease)}
.faq details[open] summary::after{transform:rotate(45deg)}
.faq details p{color:var(--muted);padding-bottom:18px;margin:0;max-width:62ch}
.wa-float{position:fixed;right:16px;bottom:16px;z-index:60;display:inline-flex;align-items:center;gap:8px;min-height:52px;padding:0 20px;border-radius:999px;background:#128c4a;color:#fff;font-weight:600;text-decoration:none;box-shadow:0 8px 24px rgb(0 0 0/.22);transition:transform .16s var(--ease)}
.wa-float:active{transform:scale(.96)}
.site-footer{border-top:1px solid var(--line);padding-block:40px;color:var(--muted);font-size:.95rem}
.footer-row{display:flex;flex-wrap:wrap;gap:16px 32px;justify-content:space-between}
.footer-row a{text-decoration:none;display:inline-flex;min-height:44px;align-items:center}
.product-page{display:grid;gap:clamp(20px,4vw,48px)}
@media (min-width:860px){.product-page{grid-template-columns:1.1fr .9fr;align-items:start}}
.gallery{display:grid;gap:12px}
.gallery .main{aspect-ratio:1/1;border-radius:var(--radius);overflow:hidden;background:var(--surface)}
.gallery .main img{width:100%;height:100%;object-fit:cover}
.thumbs{display:flex;gap:8px;overflow-x:auto}
.thumbs img{width:72px;height:72px;object-fit:cover;border-radius:10px}
.buy{display:grid;gap:14px;margin-block:20px}
.field{display:grid;gap:6px}
.field label{font-weight:600;font-size:.95rem}
.field select,.field input{min-height:48px;padding:0 14px;border:1.5px solid var(--line);border-radius:12px;background:var(--surface);color:var(--text);font:inherit}
.notice{padding:14px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--line);color:var(--muted);font-size:.95rem}
.status{min-height:1.4em;font-size:.95rem;color:var(--muted)}
.cart-table{width:100%;border-collapse:collapse}
.cart-table th{text-align:left;font-size:.85rem;color:var(--muted);font-weight:600;padding:8px 0}
.cart-table td{padding:16px 0;border-top:1px solid var(--line);vertical-align:middle}
.cart-total{display:flex;justify-content:space-between;font-size:1.2rem;font-weight:700;margin:24px 0}
.pagination{display:flex;gap:8px;flex-wrap:wrap;margin-top:32px}
.pagination a,.pagination span{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1px solid var(--line);text-decoration:none;padding:0 12px}
.reveal{opacity:0;transform:translateY(10px);transition:opacity .4s var(--ease),transform .4s var(--ease)}
.reveal.is-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important}.reveal{opacity:1;transform:none}}
`;

/** Bloque :root con la paleta y las fuentes del diseño (la vista previa lo usa tal cual; en Shopify salen de los ajustes del tema). */
export function tokensCss(d: StoreDesign): string {
  const p = d.palette;
  const serif = (f: string): boolean => f === "Lora" || f === "Playfair Display";
  const stack = (f: string): string =>
    `"${f}",${serif(f) ? "Georgia,serif" : 'system-ui,-apple-system,"Segoe UI",sans-serif'}`;
  return `:root{--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--accent:${p.accent};--accent-text:${p.accentText};--font-heading:${stack(d.fonts.heading)};--font-body:${stack(d.fonts.body)}}`;
}
