// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
/** Formato único COP: `$ 125.000`, punto de miles, sin decimales. */
export function formatCOP(value: number): string {
  const sign = value < 0 ? "−" : "";
  const n = Math.round(Math.abs(value))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}$ ${n}`;
}
