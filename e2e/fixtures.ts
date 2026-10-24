/**
 * Datos de la rama de prueba (copia de producción). Si se regenera la rama,
 * actualizar estos ids/SKUs.
 */
export const FIXTURES = {
  /** Producto cualquiera para editar la ficha. */
  editableProductId: "cmvac6l0c0001ue1xyhxgsnn0",
  /** Otro producto con COD. TANGO existente (para probar SKU repetido). */
  otherProductSku: "3001592",
  /** Producto que trae un incluido (2 por unidad) según su ficha. */
  withIncluded: { sku: "6500357", includedSku: "6502178", perUnit: 2 },
} as const;
