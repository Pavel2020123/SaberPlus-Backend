import * as fs from 'fs';
import { generarCertificadoPdf, nombreArchivoCertificado, DatosCertificado } from '../src/gamificacion/certificado-html-generator';

const casos: DatosCertificado[] = [
  { nombreEstudiante: 'Juan David Ospino Pérez', tipo: 'SOCIALES_CIUDADANAS', fecha: new Date('2026-09-19'), demo: true },
  { nombreEstudiante: 'María José Núñez-Ibáñez', tipo: 'MATEMATICAS', fecha: new Date('2026-09-19'), demo: true },
  { nombreEstudiante: "Dylan O'Connor Peña", tipo: 'INGLES', fecha: new Date('2026-09-19'), demo: true },
  { nombreEstudiante: 'Juanito Pérez', tipo: 'CURSO_COMPLETO', fecha: new Date('2026-09-19'), demo: true },
  { nombreEstudiante: 'María Fernanda de los Ángeles Castro Villafañe Rodríguez', tipo: 'LECTURA_CRITICA', fecha: new Date('2026-09-19'), demo: true },
];

(async () => {
  fs.mkdirSync('muestras', { recursive: true });
  for (const c of casos) {
    fs.writeFileSync(`muestras/${nombreArchivoCertificado(c)}`, await generarCertificadoPdf(c));
  }
})();