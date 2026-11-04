// Test worker only: inspect registered controllers, not filesystem guesses.
exports.inspectLicenseRoutes = function inspectLicenseRoutes(app) {
  const { ModulesContainer } = require('@nestjs/core');
  const { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } = require('@nestjs/common/constants');
  const { politicaHttpLicencia } = require('../dist/institucion/licencia-http.policy');
  const rows = [];
  const seen = new Set();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const type = wrapper.metatype;
      if (!type?.prototype) continue;
      for (const method of Object.getOwnPropertyNames(type.prototype)) {
        const handler = type.prototype[method];
        if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) continue;
        const key = `${type.name}.${method}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const guards = [...(Reflect.getMetadata(GUARDS_METADATA, type) ?? []), ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])]
          .map(g => typeof g === 'function' ? g.name : g.constructor.name);
        rows.push({ controller: type.name, method, verb: Reflect.getMetadata(METHOD_METADATA, handler),
          prefix: Reflect.getMetadata(PATH_METADATA, type), path: Reflect.getMetadata(PATH_METADATA, handler), guards,
          auth: guards.includes('AdminGuard') ? 'ADMIN' : guards.includes('JwtGuard') ? 'JWT' : 'PUBLIC',
          license: guards.includes('JwtGuard') ? politicaHttpLicencia(type.name, method) : null });
      }
    }
  }
  return { registered: true, total: rows.length, rows };
};
