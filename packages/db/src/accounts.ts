// Portions Copyright (c) 2026 Enrique Rocha (@soyenriquerocha) - see LICENSE for original authors
// SPDX-License-Identifier: MIT
// id: er-ff6aa75d
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { newId, StoreSettingsSchema } from "@traxo/core";
import type { Db } from "./client.ts";

export type AccountRole = "admin" | "owner";
export type AccountView = {
  id: string;
  email: string;
  name: string;
  role: AccountRole;
  storeId: string;
  tourDone: boolean;
};

export const DEMO_ADMIN = {
  email: "admin@traxo.demo",
  password: "traxo-demo",
  name: "Admin Traxo",
};

/** scrypt con sal por contraseña. Es una demo, pero no guarda contraseñas en claro. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const view = (a: {
  id: string;
  email: string;
  name: string;
  role: string;
  storeId: string;
  tourDone: boolean;
}): AccountView => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role === "admin" ? "admin" : "owner",
  storeId: a.storeId,
  tourDone: a.tourDone,
});

/** Crea (si falta) la cuenta admin de la demo, ligada a la tienda de ejemplo. */
export async function ensureDemoAdmin(
  db: Db,
  storeId: string,
  creds = DEMO_ADMIN,
): Promise<AccountView> {
  const found = await db.prisma.account.findUnique({ where: { email: creds.email } });
  if (found) return view(found);
  const a = await db.prisma.account.create({
    data: {
      id: "acc_admin",
      email: creds.email,
      name: creds.name,
      role: "admin",
      storeId,
      passwordHash: hashPassword(creds.password),
      tourDone: true,
    },
  });
  return view(a);
}

export async function login(
  db: Db,
  email: string,
  password: string,
): Promise<AccountView | undefined> {
  const a = await db.prisma.account.findUnique({ where: { email: email.trim().toLowerCase() } });
  return a && verifyPassword(password, a.passwordHash) ? view(a) : undefined;
}

export class AccountError extends Error {}

/** Cuenta nueva con su propia tienda vacía: ve el producto como lo vería un cliente el primer día. */
export async function signup(
  db: Db,
  input: { name: string; email: string; password: string; storeName: string },
  opts: { maxAccounts?: number } = {},
): Promise<AccountView> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    throw new AccountError("Escribe un correo válido.");
  if (input.password.length < 6)
    throw new AccountError("La contraseña necesita al menos 6 caracteres.");
  if (!input.name.trim() || !input.storeName.trim())
    throw new AccountError("Faltan tu nombre y el de tu tienda.");
  if (await db.prisma.account.findUnique({ where: { email } }))
    throw new AccountError("Ese correo ya tiene una cuenta. Entra con él.");
  if ((await db.prisma.account.count()) >= (opts.maxAccounts ?? 300))
    throw new AccountError("La demo llegó al máximo de cuentas. Usa la cuenta admin.");

  const id = newId("acc");
  const storeId = `store_${id.slice(4)}`;
  await db.prisma.store.create({
    data: {
      id: storeId,
      name: input.storeName.trim().slice(0, 80),
      platform: "mock",
      url: `${storeId}.mock`,
      settings: StoreSettingsSchema.parse({}),
      profile: { sample: false },
    },
  });
  const a = await db.prisma.account.create({
    data: {
      id,
      email,
      name: input.name.trim().slice(0, 80),
      role: "owner",
      storeId,
      passwordHash: hashPassword(input.password),
      tourDone: false,
    },
  });
  return view(a);
}

export async function markTourDone(db: Db, accountId: string): Promise<void> {
  await db.prisma.account.update({ where: { id: accountId }, data: { tourDone: true } });
}

export async function accountById(db: Db, id: string): Promise<AccountView | undefined> {
  const a = await db.prisma.account.findUnique({ where: { id } });
  return a ? view(a) : undefined;
}
