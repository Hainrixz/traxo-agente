import { randomUUID } from "node:crypto";

export const newId = (prefix: string): string =>
  `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
