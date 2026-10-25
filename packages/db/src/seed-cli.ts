// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { openDb } from "./client.ts";
import { seedDemo } from "./seed.ts";

const db = await openDb();
const r = await seedDemo(db);
console.log(
  `Base lista (${db.mode}). Tienda ${r.storeId}: ${r.products} productos, ${r.customers} clientes, ${r.orders} pedidos.`,
);
await db.close();
