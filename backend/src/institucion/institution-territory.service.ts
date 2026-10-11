import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Department {
  codigo: string;
  nombre: string;
  anioFuente: number;
}
interface Municipality extends Department {
  departamentoCodigo: string;
  tipo: string;
}
interface TerritoryCatalog {
  version: string;
  fuente: string;
  consultadoEn: string;
  sha256: string;
  departamentos: Department[];
  municipios: Municipality[];
}

/** Validates the packaged snapshot, not user input. Corruption must fail closed. */
export function validateTerritoryCatalog(value: unknown): TerritoryCatalog {
  const catalog = value as TerritoryCatalog;
  const fail = () => {
    throw new Error('El catálogo DIVIPOLA empaquetado no es válido.');
  };
  if (
    !catalog ||
    catalog.version !== 'DANE-DIVIPOLA-MGN-2025' ||
    catalog.fuente !==
      'https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/MapServer' ||
    typeof catalog.consultadoEn !== 'string' ||
    !Number.isFinite(Date.parse(catalog.consultadoEn)) ||
    !Array.isArray(catalog.departamentos) ||
    catalog.departamentos.length !== 33 ||
    !Array.isArray(catalog.municipios) ||
    catalog.municipios.length !== 1122
  )
    fail();
  const validName = (name: unknown) =>
    typeof name === 'string' && name.trim().length > 0 && name.length <= 250;
  const validYear = (year: number) =>
    Number.isInteger(year) && year >= 1900 && year <= 2025;
  const departments = new Set<string>();
  for (const row of catalog.departamentos) {
    if (
      !row ||
      typeof row.codigo !== 'string' ||
      !/^\d{2}$/.test(row.codigo) ||
      departments.has(row.codigo) ||
      !validName(row.nombre) ||
      !validYear(row.anioFuente)
    )
      fail();
    departments.add(row.codigo);
  }
  const municipalities = new Set<string>();
  for (const row of catalog.municipios) {
    if (
      !row ||
      typeof row.codigo !== 'string' ||
      !/^\d{5}$/.test(row.codigo) ||
      municipalities.has(row.codigo) ||
      !departments.has(row.departamentoCodigo) ||
      !row.codigo.startsWith(row.departamentoCodigo) ||
      !validName(row.nombre) ||
      !validName(row.tipo) ||
      !validYear(row.anioFuente)
    )
      fail();
    municipalities.add(row.codigo);
  }
  if (
    catalog.departamentos.some(
      (department) =>
        !catalog.municipios.some(
          (municipality) =>
            municipality.departamentoCodigo === department.codigo,
        ),
    )
  )
    fail();
  const checksum = createHash('sha256')
    .update(
      JSON.stringify({
        departamentos: catalog.departamentos,
        municipios: catalog.municipios,
      }),
    )
    .digest('hex');
  if (catalog.sha256 !== checksum) fail();
  return catalog;
}

@Injectable()
export class InstitutionTerritoryService {
  private readonly catalog = validateTerritoryCatalog(
    JSON.parse(
      readFileSync(join(__dirname, 'catalogs', 'divipola-2025.json'), 'utf8'),
    ),
  );

  private metadata() {
    const { version, fuente, consultadoEn, sha256 } = this.catalog;
    return { version, fuente, consultadoEn, sha256 };
  }

  departments() {
    return {
      ...this.metadata(),
      departamentos: this.catalog.departamentos.map((row) => ({ ...row })),
    };
  }

  municipalities(departmentCode: string) {
    this.department(departmentCode);
    return {
      ...this.metadata(),
      departamentoCodigo: departmentCode,
      municipios: this.catalog.municipios
        .filter((row) => row.departamentoCodigo === departmentCode)
        .map((row) => ({ ...row })),
    };
  }

  /** Future submit/review/filter flows must resolve codes here, never trust labels. */
  resolveLocation(departmentCode: string, municipalityCode: string) {
    const department = this.department(departmentCode);
    const municipality = this.catalog.municipios.find(
      (row) =>
        row.codigo === municipalityCode &&
        row.departamentoCodigo === departmentCode,
    );
    if (!municipality)
      throw new BadRequestException(
        'El municipio no pertenece al departamento seleccionado.',
      );
    return {
      version: this.catalog.version,
      departamento: { ...department },
      municipio: { ...municipality },
    };
  }

  private department(code: string) {
    const department = this.catalog.departamentos.find(
      (row) => row.codigo === code,
    );
    if (!department)
      throw new NotFoundException('Departamento no disponible en el catálogo.');
    return department;
  }
}
