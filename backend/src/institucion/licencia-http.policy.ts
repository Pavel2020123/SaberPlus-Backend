// Server handler identity, never URL/query/body or JWT claims supplied by clients.
// Unclassified authenticated handlers require an active entitlement by default.
const historial: Record<string, readonly string[]> = {
  // Each method authorizes its actor transactionally; creation still checks active LIC-1.
  ManagedAccountController: [
    'contexto',
    'grupos',
    'alumnos',
    'consultar',
    'solicitar',
    'aprobar',
    'previsualizar',
    'confirmar',
    'restablecer',
  ],
  AuthController: [
    'obtenerPerfil',
    'actualizarPerfil',
    'cambiarContrasenaInicial',
  ],
  SimulacroController: ['historial', 'historialRespuestas', 'obtenerProgreso'],
  LearningEvidenceController: ['obtener'],
  GamificacionController: [
    'obtenerResumen',
    'listarCertificados',
    'descargarCertificado',
    'certificadoDeLogroRetirado',
  ],
  CuadernoErroresController: ['listar', 'actualizar'],
  RankingController: ['obtener'],
  CompetitiveRankingController: ['obtener'],
  TutorialController: ['obtenerEstado', 'completar'],
  AnunciosController: [
    'listar',
    'marcarTodosLeidos',
    'marcarLeido',
    'listarInstitucion',
  ],
  StudentEvidenceController: ['obtener'],
  StudentPrioritiesController: ['list'],
  TeacherPrioritiesController: ['list', 'report'],
  TeacherStudyTimeController: ['summary'],
  StudyTimeController: ['summary'],
  InstitutionProfileController: ['own', 'update'],
  StudentInstitutionRequestController: ['own', 'cancel', 'inbox'],
  StudentInstitutionCodeController: ['own', 'preview'],
  InstitucionController: [
    'obtenerContextoProfesor',
    'obtenerMisInvitaciones',
    'obtenerAdministracion',
    'obtenerMiInstitucion',
    'obtenerGruposDelEstudiante',
    'obtenerEstudiantes',
    'obtenerAnaliticas',
    'obtenerAnaliticasBasicas',
    'obtenerAlertasRiesgo',
    'exportarAnaliticaCsv',
    'exportarAnaliticaPdf',
    'obtenerGrupos',
    'transferirPropiedad',
    'retirarMiembro',
  ],
};

export function politicaHttpLicencia(
  controlador: string,
  metodo: string,
): 'CONSULTA' | 'INTENTO' | 'NUEVO' {
  // Each license command has its own transactional actor/ownership checks.
  if (controlador === 'LicenciaInstitucionalController') return 'CONSULTA';
  // Every method revalidates its requester/reviewer; expiry cannot prevent a privacy request.
  if (controlador === 'SupresionCuentaController') return 'CONSULTA';
  if (controlador === 'EditorialResourceController' && metodo === 'content')
    return 'INTENTO';
  if (historial[controlador]?.includes(metodo)) return 'CONSULTA';
  // These services load owned persisted attempts and enforce their exact deadline.
  if (
    controlador === 'DiagnosticoController' &&
    ['obtenerEstado', 'finalizar'].includes(metodo)
  )
    return 'INTENTO';
  if (
    controlador === 'SimulacroController' &&
    ['calificar', 'calificarPersonalizado'].includes(metodo)
  )
    return 'INTENTO';
  return 'NUEVO';
}
