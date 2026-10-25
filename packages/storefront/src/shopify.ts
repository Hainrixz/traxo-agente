// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { BASE_CSS } from "./css.ts";
import { FONTS, SECTION_CATALOG, type StoreDesign } from "./design.ts";

export type ThemeFiles = Record<string, string>;

const json = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;
const schema = (v: unknown): string =>
  `{% schema %}\n${JSON.stringify(v, null, 2)}\n{% endschema %}\n`;

const THEME_JS = `(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Entrada suave de las secciones. Sin JavaScript o con "reducir movimiento" todo se ve de una vez.
  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduce) {
    items.forEach(function (el) { el.classList.add("is-in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  // Agregar al carrito sin recargar. Si algo falla, el formulario se envía normal.
  document.addEventListener("submit", function (ev) {
    var form = ev.target;
    if (!form || !form.matches || !form.matches('form[action*="/cart/add"]')) return;
    if (!window.fetch || !window.FormData) return;
    ev.preventDefault();
    var button = form.querySelector('[type="submit"]');
    var status = form.querySelector("[data-cart-status]");
    if (button) button.disabled = true;
    fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("add"); return fetch("/cart.js"); })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        document.querySelectorAll("[data-cart-count]").forEach(function (n) { n.textContent = cart.item_count; });
        if (status) status.textContent = "Agregado al carrito.";
      })
      .catch(function () { form.submit(); })
      .then(function () { if (button) button.disabled = false; });
  });
})();
`;

const sections: ThemeFiles = {
  "sections/header.liquid":
    `<header class="site-header">
  <div class="container header-row">
    <a class="brand" href="{{ routes.root_url }}">
      {%- if section.settings.logo != blank -%}
        {{ section.settings.logo | image_url: width: 240 | image_tag: loading: 'eager', alt: shop.name }}
      {%- else -%}
        {{ shop.name }}
      {%- endif -%}
    </a>
    <nav class="nav" aria-label="Principal">
      {%- for link in section.settings.menu.links -%}
        <a href="{{ link.url }}"{% if link.active %} aria-current="page"{% endif %}>{{ link.title }}</a>
      {%- endfor -%}
    </nav>
    <a class="cart-link" href="{{ routes.cart_url }}" aria-label="Carrito">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
      <span class="cart-count" data-cart-count>{{ cart.item_count }}</span>
    </a>
  </div>
</header>
` +
    schema({
      name: "Encabezado",
      settings: [
        { type: "image_picker", id: "logo", label: "Logo (opcional)" },
        { type: "link_list", id: "menu", label: "Menú", default: "main-menu" },
      ],
    }),

  "sections/footer.liquid":
    `<footer class="site-footer">
  <div class="container footer-row">
    <div>
      <strong>{{ shop.name }}</strong>
      {%- if section.settings.text != blank -%}<p>{{ section.settings.text }}</p>{%- endif -%}
    </div>
    <nav aria-label="Pie de página">
      {%- for link in section.settings.menu.links -%}
        <a href="{{ link.url }}">{{ link.title }}</a>&nbsp;&nbsp;
      {%- endfor -%}
    </nav>
    <div>&copy; {{ 'now' | date: '%Y' }} {{ shop.name }}</div>
  </div>
</footer>
` +
    schema({
      name: "Pie de página",
      settings: [
        { type: "textarea", id: "text", label: "Texto" },
        { type: "link_list", id: "menu", label: "Menú", default: "footer" },
      ],
    }),

  "sections/hero.liquid":
    `<section class="hero reveal">
  <div class="container hero-grid{% if section.settings.image != blank %} has-media{% endif %}">
    <div>
      {%- if section.settings.eyebrow != blank -%}<p class="eyebrow">{{ section.settings.eyebrow }}</p>{%- endif -%}
      <h1>{{ section.settings.heading }}</h1>
      {%- if section.settings.text != blank -%}<p class="lead">{{ section.settings.text }}</p>{%- endif -%}
      <div class="actions">
        <a class="btn" href="{{ section.settings.link | default: routes.all_products_collection_url }}">{{ section.settings.button }}</a>
      </div>
    </div>
    {%- if section.settings.image != blank -%}
      <div class="hero-media">{{ section.settings.image | image_url: width: 900 | image_tag: loading: 'eager', alt: section.settings.heading }}</div>
    {%- endif -%}
  </div>
</section>
` +
    schema({
      name: "Portada",
      settings: [
        { type: "text", id: "eyebrow", label: "Etiqueta superior" },
        { type: "text", id: "heading", label: "Título", default: "Bienvenido" },
        { type: "textarea", id: "text", label: "Texto" },
        { type: "text", id: "button", label: "Botón", default: "Ver productos" },
        { type: "url", id: "link", label: "Enlace del botón" },
        { type: "image_picker", id: "image", label: "Imagen" },
      ],
      presets: [{ name: "Portada" }],
    }),

  "sections/benefits.liquid":
    `<section class="section reveal">
  <div class="container">
    {%- if section.settings.heading != blank -%}<h2>{{ section.settings.heading }}</h2>{%- endif -%}
    <div class="benefits-grid">
      {%- for block in section.blocks -%}
        <div class="benefit" {{ block.shopify_attributes }}>
          <h3>{{ block.settings.title }}</h3>
          <p>{{ block.settings.text }}</p>
        </div>
      {%- endfor -%}
    </div>
  </div>
</section>
` +
    schema({
      name: "Beneficios",
      settings: [{ type: "text", id: "heading", label: "Título" }],
      blocks: [
        {
          type: "benefit",
          name: "Beneficio",
          settings: [
            { type: "text", id: "title", label: "Título", default: "Beneficio" },
            { type: "textarea", id: "text", label: "Texto" },
          ],
        },
      ],
      presets: [
        {
          name: "Beneficios",
          blocks: [{ type: "benefit" }, { type: "benefit" }, { type: "benefit" }],
        },
      ],
    }),

  "sections/featured-products.liquid":
    `<section class="section reveal">
  <div class="container">
    <div class="section-head">
      <h2>{{ section.settings.heading }}</h2>
      <a href="{{ section.settings.collection.url | default: routes.all_products_collection_url }}">Ver todo</a>
    </div>
    {%- assign items = section.settings.collection.products -%}
    {%- unless section.settings.collection != blank -%}{%- assign items = collections.all.products -%}{%- endunless -%}
    <div class="grid">
      {%- for product in items limit: section.settings.count -%}
        {% render 'product-card', product: product %}
      {%- else -%}
        <p class="placeholder">Agrega productos a tu tienda para verlos aquí.</p>
      {%- endfor -%}
    </div>
  </div>
</section>
` +
    schema({
      name: "Productos destacados",
      settings: [
        { type: "text", id: "heading", label: "Título", default: "Lo más pedido" },
        { type: "collection", id: "collection", label: "Colección" },
        { type: "range", id: "count", label: "Cantidad", min: 2, max: 12, step: 1, default: 8 },
      ],
      presets: [{ name: "Productos destacados" }],
    }),

  "sections/story.liquid":
    `<section class="section reveal">
  <div class="container story">
    <h2>{{ section.settings.heading }}</h2>
    {%- if section.settings.text != blank -%}
      <p>{{ section.settings.text }}</p>
    {%- else -%}
      <p class="placeholder">Cuenta aquí quién está detrás de la marca y por qué haces lo que haces.</p>
    {%- endif -%}
  </div>
</section>
` +
    schema({
      name: "Historia de la marca",
      settings: [
        { type: "text", id: "heading", label: "Título", default: "Nuestra historia" },
        { type: "textarea", id: "text", label: "Texto" },
      ],
      presets: [{ name: "Historia de la marca" }],
    }),

  "sections/social-proof.liquid":
    `<section class="section reveal">
  <div class="container">
    <h2>{{ section.settings.heading }}</h2>
    <div class="reviews">
      {%- for block in section.blocks -%}
        <figure class="review" {{ block.shopify_attributes }}>
          <blockquote>{{ block.settings.quote }}</blockquote>
          <figcaption><cite>{{ block.settings.author }}</cite></figcaption>
        </figure>
      {%- else -%}
        <p class="placeholder">Pega aquí reseñas reales de tus clientes: nombre y ciudad. Traxo no inventa testimonios.</p>
      {%- endfor -%}
    </div>
  </div>
</section>
` +
    schema({
      name: "Reseñas de clientes",
      settings: [
        { type: "text", id: "heading", label: "Título", default: "Lo que dicen nuestros clientes" },
      ],
      blocks: [
        {
          type: "review",
          name: "Reseña",
          settings: [
            { type: "textarea", id: "quote", label: "Reseña" },
            { type: "text", id: "author", label: "Nombre y ciudad" },
          ],
        },
      ],
      presets: [{ name: "Reseñas de clientes" }],
    }),

  "sections/cod-banner.liquid":
    `{%- if settings.show_cod -%}
<section class="section reveal">
  <div class="container">
    <div class="cod">
      <h2>{{ section.settings.heading }}</h2>
      <p>{{ section.settings.text }}</p>
    </div>
  </div>
</section>
{%- endif -%}
` +
    schema({
      name: "Pago contraentrega",
      settings: [
        { type: "text", id: "heading", label: "Título", default: "Paga cuando recibes" },
        {
          type: "textarea",
          id: "text",
          label: "Texto",
          default: "Contraentrega en las ciudades con cobertura. Confirmas por WhatsApp.",
        },
      ],
      presets: [{ name: "Pago contraentrega" }],
    }),

  "sections/faq.liquid":
    `<section class="section reveal">
  <div class="container faq">
    <h2>{{ section.settings.heading }}</h2>
    {%- for block in section.blocks -%}
      <details {{ block.shopify_attributes }}>
        <summary>{{ block.settings.question }}</summary>
        <p>{{ block.settings.answer }}</p>
      </details>
    {%- endfor -%}
  </div>
</section>
` +
    schema({
      name: "Preguntas frecuentes",
      settings: [{ type: "text", id: "heading", label: "Título", default: "Preguntas frecuentes" }],
      blocks: [
        {
          type: "question",
          name: "Pregunta",
          settings: [
            { type: "text", id: "question", label: "Pregunta", default: "Pregunta" },
            { type: "textarea", id: "answer", label: "Respuesta" },
          ],
        },
      ],
      presets: [
        { name: "Preguntas frecuentes", blocks: [{ type: "question" }, { type: "question" }] },
      ],
    }),

  "sections/whatsapp-cta.liquid":
    `{%- if settings.whatsapp != blank -%}
  <a class="wa-float" href="https://wa.me/{{ settings.whatsapp | strip }}?text={{ section.settings.message | url_encode }}" target="_blank" rel="noopener">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1 1 20 11.5z"/></svg>
    {{ section.settings.label }}
  </a>
{%- endif -%}
` +
    schema({
      name: "WhatsApp",
      settings: [
        { type: "text", id: "label", label: "Texto del botón", default: "Escríbenos" },
        {
          type: "text",
          id: "message",
          label: "Mensaje inicial",
          default: "Hola, tengo una pregunta sobre un producto.",
        },
      ],
    }),

  "sections/main-product.liquid":
    `{%- assign current = product.selected_or_first_available_variant -%}
<section class="section">
  <div class="container product-page">
    <div class="gallery">
      <div class="main">
        {%- if product.featured_image -%}
          {{ product.featured_image | image_url: width: 1000 | image_tag: loading: 'eager', alt: product.title }}
        {%- else -%}
          {{ 'product-1' | placeholder_svg_tag: 'placeholder' }}
        {%- endif -%}
      </div>
      {%- if product.images.size > 1 -%}
        <div class="thumbs">
          {%- for image in product.images offset: 1 limit: 6 -%}
            {{ image | image_url: width: 160 | image_tag: loading: 'lazy', alt: product.title }}
          {%- endfor -%}
        </div>
      {%- endif -%}
    </div>
    <div>
      <h1>{{ product.title }}</h1>
      <p class="price" style="font-size:1.3rem">{% render 'price', product: product %}</p>
      {% form 'product', product, class: 'buy' %}
        {%- unless product.has_only_default_variant -%}
          <div class="field">
            <label for="variant-{{ section.id }}">Opción</label>
            <select id="variant-{{ section.id }}" name="id">
              {%- for variant in product.variants -%}
                <option value="{{ variant.id }}"{% if variant == current %} selected{% endif %}{% unless variant.available %} disabled{% endunless %}>{{ variant.title }} · {{ variant.price | money_without_trailing_zeros }}</option>
              {%- endfor -%}
            </select>
          </div>
        {%- else -%}
          <input type="hidden" name="id" value="{{ current.id }}">
        {%- endunless -%}
        <div class="field">
          <label for="qty-{{ section.id }}">Cantidad</label>
          <input id="qty-{{ section.id }}" type="number" name="quantity" value="1" min="1" inputmode="numeric">
        </div>
        <button class="btn" type="submit"{% unless current.available %} disabled{% endunless %}>
          {%- if current.available -%}Agregar al carrito{%- else -%}Agotado{%- endif -%}
        </button>
        <p class="status" data-cart-status role="status" aria-live="polite"></p>
      {% endform %}
      {%- if settings.show_cod -%}
        <p class="notice">Pago contraentrega disponible en las ciudades con cobertura: confirmas por WhatsApp y pagas al recibir.</p>
      {%- endif -%}
      <div class="rte">{{ product.description }}</div>
    </div>
  </div>
</section>
` + schema({ name: "Producto", settings: [] }),

  "sections/main-collection.liquid":
    `<section class="section">
  <div class="container">
    <h1>{{ collection.title }}</h1>
    {%- if collection.description != blank -%}<div class="lead">{{ collection.description }}</div>{%- endif -%}
    {%- paginate collection.products by 12 -%}
      <div class="grid" style="margin-top:24px">
        {%- for product in collection.products -%}
          {% render 'product-card', product: product %}
        {%- else -%}
          <p class="placeholder">Esta colección todavía no tiene productos.</p>
        {%- endfor -%}
      </div>
      {%- if paginate.pages > 1 -%}<div class="pagination">{{ paginate | default_pagination }}</div>{%- endif -%}
    {%- endpaginate -%}
  </div>
</section>
` + schema({ name: "Colección", settings: [] }),

  "sections/main-search.liquid":
    `<section class="section">
  <div class="container">
    <h1>Buscar</h1>
    <form action="{{ routes.search_url }}" method="get" role="search" class="buy" style="max-width:480px">
      <div class="field">
        <label for="q-{{ section.id }}">¿Qué buscas?</label>
        <input id="q-{{ section.id }}" type="search" name="q" value="{{ search.terms | escape }}">
      </div>
      <button class="btn" type="submit">Buscar</button>
    </form>
    {%- if search.performed -%}
      {%- paginate search.results by 12 -%}
        <div class="grid" style="margin-top:24px">
          {%- for item in search.results -%}
            {%- if item.object_type == 'product' -%}
              {% render 'product-card', product: item %}
            {%- endif -%}
          {%- else -%}
            <p class="placeholder">No encontramos resultados para «{{ search.terms | escape }}».</p>
          {%- endfor -%}
        </div>
        {%- if paginate.pages > 1 -%}<div class="pagination">{{ paginate | default_pagination }}</div>{%- endif -%}
      {%- endpaginate -%}
    {%- endif -%}
  </div>
</section>
` + schema({ name: "Búsqueda", settings: [] }),

  "sections/main-cart.liquid":
    `<section class="section">
  <div class="container">
    <h1>Tu carrito</h1>
    {%- if cart.item_count == 0 -%}
      <p class="lead">Tu carrito está vacío.</p>
      <a class="btn" href="{{ routes.all_products_collection_url }}">Ver productos</a>
    {%- else -%}
      <form action="{{ routes.cart_url }}" method="post">
        <table class="cart-table">
          <thead><tr><th>Producto</th><th>Cantidad</th><th>Total</th></tr></thead>
          <tbody>
            {%- for item in cart.items -%}
              <tr>
                <td><a href="{{ item.url }}">{{ item.product.title }}</a>{% unless item.product.has_only_default_variant %}<br><small>{{ item.variant.title }}</small>{% endunless %}<br><a href="{{ item.url_to_remove }}"><small>Quitar</small></a></td>
                <td><label class="sr-only" for="q-{{ item.key }}" style="position:absolute;left:-9999px">Cantidad de {{ item.product.title }}</label><input id="q-{{ item.key }}" type="number" name="updates[]" value="{{ item.quantity }}" min="0" style="width:72px;min-height:44px"></td>
                <td>{{ item.final_line_price | money_without_trailing_zeros }}</td>
              </tr>
            {%- endfor -%}
          </tbody>
        </table>
        <div class="cart-total"><span>Subtotal</span><span>{{ cart.total_price | money_without_trailing_zeros }}</span></div>
        {%- if settings.show_cod -%}<p class="notice">¿Prefieres pagar al recibir? Escríbenos por WhatsApp para confirmar tu pedido contraentrega.</p>{%- endif -%}
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">
          <button class="btn ghost" type="submit" name="update">Actualizar</button>
          <button class="btn" type="submit" name="checkout">Pagar</button>
        </div>
      </form>
    {%- endif -%}
  </div>
</section>
` + schema({ name: "Carrito", settings: [] }),

  "sections/main-page.liquid":
    `<section class="section">
  <div class="container">
    <h1>{{ page.title }}</h1>
    <div class="rte">{{ page.content }}</div>
  </div>
</section>
` + schema({ name: "Página", settings: [] }),

  "sections/main-404.liquid":
    `<section class="section">
  <div class="container">
    <h1>No encontramos esa página</h1>
    <p class="lead">Puede que el enlace haya cambiado. Mira nuestros productos.</p>
    <a class="btn" href="{{ routes.all_products_collection_url }}">Ver productos</a>
  </div>
</section>
` + schema({ name: "Página no encontrada", settings: [] }),
};

const snippets: ThemeFiles = {
  "snippets/price.liquid": `{%- if product.compare_at_price > product.price -%}<s>{{ product.compare_at_price | money_without_trailing_zeros }}</s>{%- endif -%}<span>{{ product.price | money_without_trailing_zeros }}</span>
`,
  "snippets/product-card.liquid": `<article class="card">
  <a class="card-media" href="{{ product.url }}" tabindex="-1" aria-hidden="true">
    {%- if product.featured_image -%}
      {{ product.featured_image | image_url: width: 600 | image_tag: loading: 'lazy', widths: '300, 450, 600', sizes: '(min-width: 1040px) 25vw, (min-width: 760px) 33vw, 50vw', alt: '' }}
    {%- else -%}
      {{ 'product-1' | placeholder_svg_tag: 'placeholder' }}
    {%- endif -%}
  </a>
  <div class="card-body">
    <h3><a href="{{ product.url }}">{{ product.title }}</a></h3>
    <p class="price">{% render 'price', product: product %}</p>
  </div>
</article>
`,
};

/** Genera el tema de Shopify (Online Store 2.0, en español) a partir del diseño. */
export function buildShopifyTheme(d: StoreDesign): ThemeFiles {
  const byId = new Map(SECTION_CATALOG.map((s) => [s.id, s]));
  const home: Record<string, unknown> = {};
  const order: string[] = [];
  for (const id of d.sections) {
    const cat = byId.get(id);
    if (!cat) continue;
    const key = id;
    order.push(key);
    switch (id) {
      case "hero":
        home[key] = {
          type: "hero",
          settings: {
            eyebrow: d.tagline,
            heading: d.copy.headline,
            text: d.copy.sub,
            button: d.copy.cta,
          },
        };
        break;
      case "beneficios":
        home[key] = {
          type: "benefits",
          blocks: Object.fromEntries(
            d.copy.benefits.map((b, i) => [
              `b${i}`,
              { type: "benefit", settings: { title: b.title, text: b.text } },
            ]),
          ),
          block_order: d.copy.benefits.map((_, i) => `b${i}`),
          settings: { heading: "" },
        };
        break;
      case "productos":
        home[key] = { type: "featured-products", settings: { heading: "Lo más pedido", count: 8 } };
        break;
      case "historia":
        home[key] = {
          type: "story",
          settings: { heading: "Nuestra historia", text: d.copy.story },
        };
        break;
      case "prueba-social":
        home[key] = {
          type: "social-proof",
          settings: { heading: "Lo que dicen nuestros clientes" },
        };
        break;
      case "contraentrega":
        home[key] = {
          type: "cod-banner",
          settings: {
            heading: "Paga cuando recibes",
            text: "Contraentrega en las ciudades con cobertura. Confirmas por WhatsApp y pagas al recibir.",
          },
        };
        break;
      case "faq":
        home[key] = {
          type: "faq",
          blocks: Object.fromEntries(
            d.copy.faq.map((f, i) => [
              `q${i}`,
              { type: "question", settings: { question: f.q, answer: f.a } },
            ]),
          ),
          block_order: d.copy.faq.map((_, i) => `q${i}`),
          settings: { heading: "Preguntas frecuentes" },
        };
        break;
      case "whatsapp":
        order.pop();
        break;
    }
  }

  const page = (type: string) => json({ sections: { main: { type } }, order: ["main"] });
  const f = (name: string, which: "regular" | "bold") => FONTS[name]?.[which] ?? "inter_n4";

  const themeLiquid = `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="{{ settings.color_bg }}">
  <title>{{ page_title | escape }}{% unless page_title contains shop.name %} · {{ shop.name | escape }}{% endunless %}</title>
  {%- if page_description != blank -%}<meta name="description" content="{{ page_description | escape }}">{%- endif -%}
  <link rel="canonical" href="{{ canonical_url }}">
  {{ content_for_header }}
  {%- style -%}
    {{ settings.font_heading | font_face: font_display: 'swap' }}
    {{ settings.font_body | font_face: font_display: 'swap' }}
    :root {
      --bg: {{ settings.color_bg }};
      --surface: {{ settings.color_surface }};
      --text: {{ settings.color_text }};
      --muted: {{ settings.color_muted }};
      --accent: {{ settings.color_accent }};
      --accent-text: {{ settings.color_accent_text }};
      --font-heading: {{ settings.font_heading.family }}, {{ settings.font_heading.fallback_families }};
      --font-body: {{ settings.font_body.family }}, {{ settings.font_body.fallback_families }};
    }
  {%- endstyle -%}
  {{ 'theme.css' | asset_url | stylesheet_tag }}
  <script src="{{ 'theme.js' | asset_url }}" defer></script>
</head>
<body class="template-{{ template.name }}">
  <a class="skip" href="#main">Saltar al contenido</a>
  {% section 'header' %}
  <main id="main">
    {{ content_for_layout }}
  </main>
  {% section 'footer' %}
${d.sections.includes("whatsapp") ? "  {% section 'whatsapp-cta' %}\n" : ""}</body>
</html>
`;

  const colorSetting = (id: string, label: string, def: string) => ({
    type: "color",
    id,
    label,
    default: def,
  });
  const p = d.palette;
  const settingsSchema = [
    {
      name: "theme_info",
      theme_name: `${d.brand} · Traxo`,
      theme_version: "1.0.0",
      theme_author: "Traxo",
      theme_documentation_url: "https://github.com/Hainrixz/traxo-agente",
      theme_support_url: "https://github.com/Hainrixz/traxo-agente/issues",
    },
    {
      name: "Colores",
      settings: [
        colorSetting("color_bg", "Fondo", p.bg),
        colorSetting("color_surface", "Tarjetas", p.surface),
        colorSetting("color_text", "Texto", p.text),
        colorSetting("color_muted", "Texto secundario", p.muted),
        colorSetting("color_accent", "Botones y acentos", p.accent),
        colorSetting("color_accent_text", "Texto de los botones", p.accentText),
      ],
    },
    {
      name: "Tipografía",
      settings: [
        {
          type: "font_picker",
          id: "font_heading",
          label: "Títulos",
          default: f(d.fonts.heading, "bold"),
        },
        {
          type: "font_picker",
          id: "font_body",
          label: "Texto",
          default: f(d.fonts.body, "regular"),
        },
      ],
    },
    {
      name: "Tienda",
      settings: [
        {
          type: "checkbox",
          id: "show_cod",
          label: "Mostrar que se puede pagar contraentrega",
          default: d.cod,
        },
        {
          type: "text",
          id: "whatsapp",
          label: "WhatsApp (solo números con indicativo, ej. 573001112233)",
          default: d.contact.whatsapp ?? "",
        },
      ],
    },
  ];
  const settingsData = {
    current: {
      color_bg: p.bg,
      color_surface: p.surface,
      color_text: p.text,
      color_muted: p.muted,
      color_accent: p.accent,
      color_accent_text: p.accentText,
      font_heading: f(d.fonts.heading, "bold"),
      font_body: f(d.fonts.body, "regular"),
      show_cod: d.cod,
      whatsapp: d.contact.whatsapp ?? "",
    },
  };

  const readme = `# ${d.brand} · tema de Shopify generado por Traxo

Tema Online Store 2.0 en español. Estilo: ${d.style}. Fuentes: ${d.fonts.heading} y ${d.fonts.body}.

## Cómo usarlo
1. **Sin instalar nada:** comprime esta carpeta en un .zip (o usa el .zip que descarga Traxo) y súbelo en *Tienda online → Temas → Agregar tema → Subir archivo zip*. Queda sin publicar: míralo y personalízalo antes de publicarlo.
2. **Con Shopify CLI:** \`shopify theme push --unpublished --store tu-tienda\`.

## Qué trae
- Portada con secciones editables: ${d.sections.join(", ")}.
- Producto, colección, búsqueda, carrito, página y 404.
- Colores y fuentes en *Personalizar → Ajustes del tema*.
- Accesible (contraste 4,5:1, foco visible, objetivos táctiles de 44 px) y respeta «reducir movimiento».

Las reseñas de clientes no se inventan: se dejan vacías para que pegues las reales.
`;

  return {
    "layout/theme.liquid": themeLiquid,
    "config/settings_schema.json": json(settingsSchema),
    "config/settings_data.json": json(settingsData),
    "locales/es.default.json": json({ general: { skip: "Saltar al contenido" } }),
    "templates/index.json": json({ sections: home, order }),
    "templates/product.json": page("main-product"),
    "templates/collection.json": page("main-collection"),
    "templates/search.json": page("main-search"),
    "templates/cart.json": page("main-cart"),
    "templates/page.json": page("main-page"),
    "templates/404.json": page("main-404"),
    ...sections,
    ...snippets,
    "assets/theme.css": BASE_CSS,
    "assets/theme.js": THEME_JS,
    "README.md": readme,
  };
}
