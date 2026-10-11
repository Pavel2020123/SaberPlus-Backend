// Manual, pinned-source update. Never executed by build/start or against a database.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const source =
  'https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/MapServer';
const version = 'DANE-DIVIPOLA-MGN-2025';

async function readLayer(layer, fields) {
  const url = new URL(`${source}/${layer}/query`);
  url.search = new URLSearchParams({
    where: '1=1',
    outFields: fields,
    returnGeometry: 'false',
    f: 'json',
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`DANE HTTP ${response.status}`);
  const body = await response.json();
  if (
    body.error ||
    body.exceededTransferLimit ||
    !Array.isArray(body.features)
  ) {
    throw new Error(
      'Incomplete or invalid DANE response; existing snapshot was not changed.',
    );
  }
  const countUrl = new URL(`${source}/${layer}/query`);
  countUrl.search = new URLSearchParams({
    where: '1=1',
    returnCountOnly: 'true',
    f: 'json',
  });
  const countResponse = await fetch(countUrl, {
    signal: AbortSignal.timeout(60000),
  });
  if (!countResponse.ok)
    throw new Error(`DANE count HTTP ${countResponse.status}`);
  const count = await countResponse.json();
  if (count.count !== body.features.length)
    throw new Error('DANE count differs from downloaded records.');
  return body.features.map((feature) => feature.attributes);
}

const [departments, municipalities] = await Promise.all([
  readLayer(319, 'DPTO_CCDGO,DPTO_CNMBRE,DPTO_NANO'),
  readLayer(317, 'DPTO_CCDGO,MPIO_CDPMP,MPIO_CNMBRE,MPIO_TIPO,MPIO_NANO'),
]);
const byCode = (a, b) => a.codigo.localeCompare(b.codigo);
const departamentos = departments
  .map((row) => ({
    codigo: row.DPTO_CCDGO,
    nombre: row.DPTO_CNMBRE,
    anioFuente: row.DPTO_NANO,
  }))
  .sort(byCode);
const municipios = municipalities
  .map((row) => ({
    codigo: row.MPIO_CDPMP,
    departamentoCodigo: row.DPTO_CCDGO,
    nombre: row.MPIO_CNMBRE,
    tipo: row.MPIO_TIPO,
    anioFuente: row.MPIO_NANO,
  }))
  .sort(byCode);
const departmentCodes = new Set(departamentos.map((row) => row.codigo));
const validName = (value) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 250;
const validYear = (value) =>
  Number.isInteger(value) && value >= 1900 && value <= 2025;
// These counts belong to this specific edition. A different edition requires review.
if (
  departamentos.length !== 33 ||
  municipios.length !== 1122 ||
  departmentCodes.size !== 33 ||
  new Set(municipios.map((row) => row.codigo)).size !== 1122 ||
  departamentos.some(
    (row) =>
      typeof row.codigo !== 'string' ||
      !/^\d{2}$/.test(row.codigo) ||
      !validName(row.nombre) ||
      !validYear(row.anioFuente),
  ) ||
  municipios.some(
    (row) =>
      typeof row.codigo !== 'string' ||
      !/^\d{5}$/.test(row.codigo) ||
      !departmentCodes.has(row.departamentoCodigo) ||
      !row.codigo.startsWith(row.departamentoCodigo) ||
      !validName(row.nombre) ||
      !validName(row.tipo) ||
      !validYear(row.anioFuente),
  )
) {
  throw new Error(
    'Catalog validation failed; review official edition before replacing the snapshot.',
  );
}
const data = { departamentos, municipios };
const catalog = {
  version,
  fuente: source,
  consultadoEn: new Date().toISOString(),
  sha256: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
  ...data,
};
const directory = new URL('../src/institucion/catalogs/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL('divipola-2025.json', directory),
  `${JSON.stringify(catalog, null, 2)}\n`,
  'utf8',
);
console.log(
  JSON.stringify({
    version,
    departamentos: departamentos.length,
    municipios: municipios.length,
    sha256: catalog.sha256,
  }),
);
