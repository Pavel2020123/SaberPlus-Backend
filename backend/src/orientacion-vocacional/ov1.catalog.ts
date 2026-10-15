import { FAMILIAS, PREFIJOS } from "./ov1.rules";
// Immutable V1; content review remains required before publication.
export const CUESTIONARIO_V1 = [
  {
    "id": "T1",
    "texto": "Me gustaría entender cómo funcionan los programas, aplicaciones o sistemas digitales."
  },
  {
    "id": "T2",
    "texto": "Disfrutaría buscar soluciones cuando un aparato, sistema o proceso no funciona como debería."
  },
  {
    "id": "T3",
    "texto": "Me interesaría crear una aplicación, herramienta digital o solución tecnológica."
  },
  {
    "id": "T4",
    "texto": "Me llama la atención analizar datos para encontrar patrones o resolver problemas."
  },
  {
    "id": "T5",
    "texto": "Disfrutaría diseñar o mejorar objetos, procesos o sistemas mediante lógica y tecnología."
  },
  {
    "id": "S1",
    "texto": "Me interesaría aprender cómo funciona el cuerpo humano y cómo cuidar la salud."
  },
  {
    "id": "S2",
    "texto": "Me sentiría motivado ayudando a una persona durante un proceso de cuidado o recuperación."
  },
  {
    "id": "S3",
    "texto": "Me gustaría investigar enfermedades, seres vivos o procesos biológicos."
  },
  {
    "id": "S4",
    "texto": "Me interesaría participar en actividades relacionadas con prevención y bienestar."
  },
  {
    "id": "S5",
    "texto": "Disfrutaría observar, analizar y comprender fenómenos relacionados con la vida y la salud."
  },
  {
    "id": "C1",
    "texto": "Me interesa comprender por qué las personas y las sociedades actúan de determinadas maneras."
  },
  {
    "id": "C2",
    "texto": "Disfrutaría defender una idea utilizando argumentos y evidencia."
  },
  {
    "id": "C3",
    "texto": "Me gustaría comunicar información mediante textos, entrevistas, medios o presentaciones."
  },
  {
    "id": "C4",
    "texto": "Me interesaría participar en la solución de problemas que afectan a una comunidad."
  },
  {
    "id": "C5",
    "texto": "Disfrutaría analizar normas, conflictos, acontecimientos sociales o decisiones públicas."
  },
  {
    "id": "N1",
    "texto": "Me gustaría organizar personas y recursos para alcanzar un objetivo."
  },
  {
    "id": "N2",
    "texto": "Me interesa comprender cómo funcionan las empresas, organizaciones o mercados."
  },
  {
    "id": "N3",
    "texto": "Disfrutaría planear un proyecto y tomar decisiones sobre recursos, tiempo y prioridades."
  },
  {
    "id": "N4",
    "texto": "Me llamaría la atención crear o mejorar un producto, servicio o iniciativa propia."
  },
  {
    "id": "N5",
    "texto": "Me interesa analizar costos, ingresos, oportunidades o resultados para tomar decisiones."
  },
  {
    "id": "H1",
    "texto": "Me gustaría explicar un tema hasta ayudar a otra persona a comprenderlo."
  },
  {
    "id": "H2",
    "texto": "Disfruto leer, interpretar o discutir ideas expresadas en textos."
  },
  {
    "id": "H3",
    "texto": "Me interesa conocer otras lenguas, culturas y formas de comunicación."
  },
  {
    "id": "H4",
    "texto": "Me gustaría investigar acontecimientos históricos, ideas filosóficas o expresiones culturales."
  },
  {
    "id": "H5",
    "texto": "Me sentiría motivado acompañando procesos de aprendizaje de otras personas."
  },
  {
    "id": "D1",
    "texto": "Disfrutaría crear piezas visuales, objetos o experiencias buscando que comuniquen una idea."
  },
  {
    "id": "D2",
    "texto": "Me gusta imaginar diferentes formas de resolver un problema de manera creativa."
  },
  {
    "id": "D3",
    "texto": "Me interesaría diseñar espacios, productos, imágenes o experiencias útiles para otras personas."
  },
  {
    "id": "D4",
    "texto": "Me gustaría trabajar en proyectos relacionados con naturaleza, ambiente, territorio o producción sostenible."
  },
  {
    "id": "D5",
    "texto": "Disfrutaría combinar observación, creatividad y trabajo práctico para transformar una idea en algo concreto."
  }
].map(p => Object.freeze({ ...p, familia: FAMILIAS[PREFIJOS.indexOf(p.id[0])] }));
Object.freeze(CUESTIONARIO_V1);
