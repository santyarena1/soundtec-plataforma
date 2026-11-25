// Pedidos de clientes que ve el equipo: con «Ver todos los clientes» (admins incluidos), todos;
// si no, los de sus clientes (responsable = ownerId), igual que la ficha del cliente.
// Los pedidos sin empresa (ni en el pedido ni en el usuario) no tienen responsable: los ve quien atiende pedidos.

export type RequestScopeWhere =
  | Record<string, never>
  | {
      OR: Array<
        | { client: { ownerId: string } }
        | { clientId: null; user: { client: { ownerId: string } } }
        | { clientId: null; user: { clientId: null } }
      >;
    };

export function requestScopeWhere(input: { userId: string; seesAllClients: boolean }): RequestScopeWhere {
  if (input.seesAllClients) return {};
  return {
    OR: [
      { client: { ownerId: input.userId } },
      { clientId: null, user: { client: { ownerId: input.userId } } },
      { clientId: null, user: { clientId: null } },
    ],
  };
}
