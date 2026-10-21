// Identidad estable, sin credenciales ni URL efímera del proveedor de almacenamiento.
export function managedEditorialImageId(value: string): string | null {
  return (
    /^\/recursos\/editoriales\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i
      .exec(value ?? '')?.[1]
      ?.toLowerCase() ?? null
  );
}
export const editorialImagePath = (id: string) => `/recursos/editoriales/${id}`;
