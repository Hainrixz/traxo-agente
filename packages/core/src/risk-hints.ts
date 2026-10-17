/** Misma idea que geo-co.addressLooksComplete, sin depender de ese paquete (core no importa a nadie). */
export const addressLooksCompleteHint = (street: string): boolean =>
  /\d/.test(street) &&
  /(calle|carrera|avenida|diagonal|transversal|cl|cra|kr|av|mz|manzana|vereda|finca)/i.test(street);
