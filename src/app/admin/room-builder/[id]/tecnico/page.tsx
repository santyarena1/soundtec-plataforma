import { redirect } from "next/navigation";

/** El plano técnico vive en la misma pantalla del modelo: esta ruta abre el editor en esa vista. */
export default function RoomBuilderTechnicalPage({ params }: { params: { id: string } }) {
  redirect(`/admin/room-builder/${params.id}?view=tecnico`);
}
