import { formatCOP } from "@traxo/core";
import type { TemplateName } from "./types.ts";

type Vars = {
  nombre: string;
  guia?: string;
  transportadora?: string;
  url?: string;
  monto?: number;
  tienda: string;
  dias?: number;
  /** Descuento por pagar ahora y el monto que quedaría. */
  descuentoPct?: number;
  montoPrepago?: number;
};

const first = (n: string): string => n.split(" ")[0] ?? n;

/** Textos en español de Colombia, tuteo, cortos. Las plantillas de utilidad de WhatsApp usan estos mismos textos. */
export const TEMPLATES: Record<TemplateName, (v: Vars) => string> = {
  pedido_en_camino: (v) =>
    `Hola ${first(v.nombre)}, tu pedido de ${v.tienda} ya va en camino con ${v.transportadora}. Guía ${v.guia}. Llega en ${v.dias ?? 3} días hábiles. Rastréalo aquí: ${v.url}`,
  llega_hoy: (v) =>
    `Hola ${first(v.nombre)}, tu pedido llega hoy. ${v.monto ? `Ten listos ${formatCOP(v.monto)} para pagar al recibir. ` : ""}Guía ${v.guia}.`,
  novedad_entrega: (v) =>
    `Hola ${first(v.nombre)}, la transportadora no pudo entregar tu pedido (guía ${v.guia}). ¿Quieres que lo reprogramemos para mañana? Responde SÍ o dime otra dirección.`,
  confirmar_contraentrega: (v) =>
    `Hola ${first(v.nombre)}, recibimos tu pedido en ${v.tienda}. Pagas ${formatCOP(v.monto ?? 0)} al recibir. ¿Confirmas tu dirección y que estarás para recibirlo?${v.descuentoPct && v.montoPrepago ? ` Si prefieres pagar ahora tienes ${v.descuentoPct} % de descuento: ${formatCOP(v.montoPrepago)}.` : ""}`,
  pago_recibido: (v) =>
    `Recibimos tu pago, ${first(v.nombre)}. Preparamos tu pedido de ${v.tienda} y te avisamos cuando salga.`,
  pedido_cancelado: (v) =>
    `Listo, ${first(v.nombre)}, cancelamos tu pedido de ${v.tienda}. Cuando quieras volver a pedir, aquí estamos.`,
};

export function render(name: TemplateName, vars: Vars): string {
  return TEMPLATES[name](vars);
}
