/** Payload real de orders/create de Shopify (recortado) para tests y la demo. */
export const shopifyOrder = {
  id: 820982911946154508,
  name: "#1042",
  email: "valentina@correo.co",
  created_at: "2026-10-16T14:02:00-05:00",
  total_price: "136000.00",
  payment_gateway_names: ["Cash on Delivery (COD)"],
  landing_site: "/?utm_source=instagram&utm_campaign=lanzamiento",
  shipping_address: {
    name: "Valentina Ospina",
    phone: "300 123 4567",
    address1: "cra 7 #80-21",
    address2: "apto 402",
    city: "Pereira",
    province: "Risaralda",
  },
  line_items: [
    {
      product_id: 9001,
      title: "Café Huila 340 g (grano)",
      quantity: 2,
      price: "38000.00",
      grams: 380,
    },
    { product_id: 9004, title: "Kit degustación x3", quantity: 1, price: "60000.00", grams: 1200 },
  ],
  total_shipping_price_set: { shop_money: { amount: "0.00" } },
};
