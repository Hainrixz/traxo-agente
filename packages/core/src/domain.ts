import { z } from "zod";

export const Platform = z.enum(["shopify", "tiendanube", "woocommerce", "mock"]);
export type Platform = z.infer<typeof Platform>;

/** 0 = todo con aprobación · 1 = logística automática, gasto en anuncios/créditos siempre con aprobación. */
export const Autonomy = z.union([z.literal(0), z.literal(1)]);
export type Autonomy = z.infer<typeof Autonomy>;

export const AddressSchema = z.object({
  name: z.string(),
  phone: z.string(),
  street: z.string(),
  neighborhood: z.string().optional(),
  city: z.string(),
  /** Código DANE de municipio, 5 dígitos (p. ej. 66001 = Pereira). */
  dane: z.string().regex(/^\d{5}$/),
  department: z.string(),
  notes: z.string().optional(),
});
export type Address = z.infer<typeof AddressSchema>;

export const PaymentMethod = z.enum(["cod", "prepaid"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const OrderLineSchema = z.object({
  productId: z.string(),
  title: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  weightGrams: z.number().int().positive().default(500),
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  number: z.string(),
  storeId: z.string(),
  customerId: z.string().optional(),
  email: z.string().optional(),
  address: AddressSchema,
  lines: z.array(OrderLineSchema).min(1),
  subtotal: z.number().int().nonnegative(),
  shippingCharged: z.number().int().nonnegative().default(0),
  total: z.number().int().nonnegative(),
  payment: PaymentMethod,
  utm: z.record(z.string(), z.string()).optional(),
  createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  title: z.string(),
  price: z.number().int().nonnegative(),
  cost: z.number().int().nonnegative().optional(),
  weightGrams: z.number().int().positive().default(500),
  imageUrl: z.string().optional(),
  description: z.string().optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  externalId: z.string().optional(),
  name: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  city: z.string().optional(),
  whatsappConsent: z.boolean().default(false),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const TrackingStatus = z.enum([
  "created",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "incident",
  "returning",
  "returned",
  "cancelled",
]);
export type TrackingStatus = z.infer<typeof TrackingStatus>;

export const TrackingEventSchema = z.object({
  status: TrackingStatus,
  description: z.string(),
  location: z.string().optional(),
  at: z.string(),
});
export type TrackingEvent = z.infer<typeof TrackingEventSchema>;

export const QuoteSchema = z.object({
  /** Quién cotizó: envia-com, 99envios, coordinadora… */
  provider: z.string(),
  /** Transportadora real que movería el paquete. */
  carrier: z.string(),
  service: z.string(),
  freight: z.number().int().nonnegative(),
  codCommission: z.number().int().nonnegative().default(0),
  supportsCod: z.boolean(),
  businessDays: z.number().int().positive(),
  currency: z.literal("COP").default("COP"),
  simulated: z.boolean().default(false),
});
export type Quote = z.infer<typeof QuoteSchema>;

export const StoreSettingsSchema = z.object({
  autonomy: Autonomy.default(1),
  /** Si el costo total de la guía supera esto, pide aprobación aunque autonomía = 1. */
  maxAutoShipmentCost: z.number().int().positive().default(60000),
  /** Con qué plataforma de envíos trabaja hoy la tienda (se prueba primero). */
  preferredProvider: z.string().optional(),
  weights: z
    .object({ cost: z.number(), speed: z.number(), reliability: z.number() })
    .default({ cost: 0.55, speed: 0.3, reliability: 0.15 }),
  originDane: z
    .string()
    .regex(/^\d{5}$/)
    .default("11001"),
  /** Confirmar la contraentrega por WhatsApp antes de generar la guía: nunca, solo si el riesgo es alto, o siempre. */
  confirmCod: z.enum(["off", "risky", "all"]).default("off"),
  /** Riesgo (0–100) desde el cual se pide confirmación cuando confirmCod = "risky". */
  riskThreshold: z.number().int().min(1).max(100).default(40),
  /** Descuento que se ofrece si el cliente cambia a pagar ahora (prepago). */
  prepaidDiscountPct: z.number().int().min(0).max(30).default(5),
});
export type StoreSettings = z.infer<typeof StoreSettingsSchema>;

export type ShipmentDraft = {
  orderId: string;
  origin: { dane: string };
  destination: Address;
  weightGrams: number;
  declaredValue: number;
  codAmount: number;
  contents: string;
};

export type CreatedShipment = {
  provider: string;
  carrier: string;
  service: string;
  trackingNumber: string;
  labelUrl: string;
  trackUrl: string;
  total: number;
  simulated: boolean;
};
