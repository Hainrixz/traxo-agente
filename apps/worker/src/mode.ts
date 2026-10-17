/**
 * Traxo se instala para operar una tienda real. El modo de demostración (cuenta de ejemplo, datos simulados, registro libre)
 * solo existe si se pide expresamente con TRAXO_DEMO=1; nunca se activa solo.
 */
export const isDemo = (): boolean => process.env.TRAXO_DEMO === "1";
