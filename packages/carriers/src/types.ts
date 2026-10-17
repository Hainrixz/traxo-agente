import type { CreatedShipment, Quote, ShipmentDraft, TrackingEvent } from "@traxo/core";

/** Una vía para cotizar y despachar: un agregador (Envia.com, 99envios) o una transportadora directa. */
export interface CarrierProvider {
  /** Identificador estable: "envia-com", "99envios", "coordinadora"… */
  readonly id: string;
  readonly label: string;
  /** true si habla con el servicio real; false si es el simulador. */
  readonly live: boolean;
  quote(draft: ShipmentDraft): Promise<Quote[]>;
  createShipment(draft: ShipmentDraft, chosen: Quote): Promise<CreatedShipment>;
  track(trackingNumber: string): Promise<TrackingEvent[]>;
  cancel(trackingNumber: string): Promise<void>;
}
