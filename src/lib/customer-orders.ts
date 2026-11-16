/**
 * Pedidos desde el portal — BANDERA ÚNICA (temporal).
 *
 * Mientras esté en `false`, en el portal nadie arma ni envía pedidos:
 * - Se ocultan «Agregar al pedido», «Mi pedido», el flotante del borrador,
 *   la selección múltiple para pedir y los accesos a «Pedidos» del inicio.
 * - /portal/requests/** y /portal/cart redirigen al inicio del portal.
 * - Las server actions del cliente (agregar, cambiar cantidad, quitar, enviar,
 *   escribir en el pedido) rechazan la operación.
 *
 * Vale para cualquiera que navegue el portal, también el equipo con
 * «Ver como cliente»: el portal se comporta como lo ve un cliente.
 * La gestión de pedidos del panel (/admin/requests) sigue igual.
 *
 * Para volver a habilitar: poner `true` acá. No hay que tocar nada más.
 */
export const CUSTOMER_ORDERS_ENABLED: boolean = false;

/** Mensaje para cuando una acción de pedido llega con la función apagada. */
export const CUSTOMER_ORDERS_DISABLED_MESSAGE =
  "Los pedidos desde el portal todavía no están habilitados. Para cotizar, escribile a tu vendedor de Soundtec.";
