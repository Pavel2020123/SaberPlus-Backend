import test from "node:test";
import assert from "node:assert/strict";
import { createAdminServer } from "../server.mjs";
import { CatalogApi } from "../public/api.mjs";
test("demo ADMIN: pedir información, aprobar, conflicto, suspender y cerrar sesión", async (t) => {
  const server = createAdminServer({ demo: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`,
    api = new CatalogApi(`${base}/api`);
  assert.equal(
    (await fetch(`${base}/api/admin/instituciones/solicitudes`)).status,
    401,
  );
  assert.equal((await fetch(`${base}/institution-approval.mjs`)).status, 200);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  assert.equal((await fetch(`${base}/institution-territory.mjs`)).status, 200);
  assert.equal((await api.territoryDepartments()).departamentos.length, 3);
  assert.equal((await api.territoryMunicipalities('91')).municipios[0].nombre, 'Leticia');
  const list = await api.institutionApplications("PENDIENTE");
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].evidencia, undefined);
  const id = list.items[0].id;
  const decision = (revision, estado) => ({
    revision,
    estado,
    mensaje: "Respuesta visible de demostración.",
    notaInterna: "Verificación privada de demostración.",
    confirmado: true,
  });
  await api.reviewInstitution(id, decision(1, "REQUIERE_INFORMACION"));
  await assert.rejects(
    api.reviewInstitution(id, decision(1, "APROBADA")),
    (e) => e.status === 409,
  );
  await api.reviewInstitution(id, decision(2, "APROBADA"));
  assert.equal(
    (await api.institutionApplications("PENDIENTE")).items.length,
    0,
  );
  await api.reviewInstitution(id, decision(3, "SUSPENDIDA"));
  const detail = await api.institutionApplication(id);
  assert.equal(detail.estado, "SUSPENDIDA");
  assert.equal(detail.historial.length, 3);
  await assert.rejects(api.reviewInstitution(id, { ...decision(4, 'APROBADA'), departamentoCodigo: '91', municipioCodigo: '20001' }), e => e.status === 400);
  await api.reviewInstitution(id, { ...decision(4, 'APROBADA'), departamentoCodigo: '91', municipioCodigo: '91001' });
  await api.reviewInstitution(id, { ...decision(5, 'APROBADA'), departamentoCodigo: '20', municipioCodigo: '20001' });
  const corrected = await api.institutionApplication(id);
  assert.equal(corrected.municipioCodigo, '20001');
  assert.equal(corrected.historial.at(-1).accion, 'UBICACION_CORREGIDA');
  assert.equal(corrected.historial.at(-1).ubicacionAnterior.municipioCodigo, '91001');
  await assert.rejects(api.reviewInstitution(id, { ...decision(6, 'APROBADA'), departamentoCodigo: '20', municipioCodigo: '20001' }), e => e.status === 400);
  api.logout();
  assert.throws(() => api.institutionApplications());
});
