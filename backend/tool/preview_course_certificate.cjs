// Local-only preview. No HTTP route, authentication, database or real student data.
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { CertificadoHtmlService, construirHtml } = require('../dist/gamificacion/certificado-html.service');

async function main() {
  const directory = join(__dirname, '..', 'output', 'pdf');
  await mkdir(directory, { recursive: true });
  const renderer = new CertificadoHtmlService();
  const cases = [
    ['certificado-area-demo', 'Juan David Ospino Pérez', 'Sociales y ciudadanas', false],
    ['certificado-lectura-demo', 'Estudiante de demostración', 'Lectura crítica', false],
    ['certificado-matematicas-demo', 'Estudiante de demostración', 'Matemáticas', false],
    ['certificado-ciencias-demo', 'Estudiante de demostración', 'Ciencias naturales', false],
    ['certificado-ingles-demo', 'Estudiante de demostración', 'Inglés', false],
    ['certificado-curso-demo', 'Juanito Pérez', 'Curso completo de SaberPlus', true],
    ['certificado-nombre-largo-demo', 'María José de los Ángeles Fernández de la Cruz '.repeat(5).trim(), 'Matemáticas', false],
  ];
  for (const [file, nombre, area, cursoCompleto] of cases) {
    const datos = { nombre, area, cursoCompleto, fecha: new Date('2026-09-20T12:00:00Z'), demostracion: true };
    await writeFile(join(directory, `${file}.html`), await construirHtml(datos));
    await writeFile(join(directory, `${file}.pdf`), await renderer.generar(datos));
    console.log(`Muestra local: output/pdf/${file}.pdf`);
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
