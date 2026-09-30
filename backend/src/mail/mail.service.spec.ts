import { Logger } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { createServer, Server, Socket } from 'node:net';
import { MailService } from './mail.service';

// Servidor SMTP desechable: solo loopback, sin reenvío ni cuentas reales.
describe('MailService con Nodemailer real y SMTP local', () => {
  let server: Server;
  const sockets = new Set<Socket>();
  let messages: string[];
  let commands: string[];
  let rejectMail: boolean;
  let previousEnv: NodeJS.ProcessEnv;
  let logError: jest.SpyInstance;

  beforeEach(async () => {
    previousEnv = { ...process.env };
    messages = [];
    commands = [];
    rejectMail = false;
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      let input = '';
      let data = false;
      let message: string[] = [];
      socket.setEncoding('utf8');
      socket.write('220 localhost test SMTP\r\n');
      socket.on('data', (chunk: string) => {
        input += chunk;
        let end: number;
        while ((end = input.indexOf('\r\n')) >= 0) {
          const line = input.slice(0, end);
          input = input.slice(end + 2);
          if (data) {
            if (line === '.') {
              messages.push(message.join('\r\n'));
              message = [];
              data = false;
              socket.write('250 queued locally\r\n');
            } else message.push(line.replace(/^\.\./, '.'));
            continue;
          }
          commands.push(line);
          if (/^EHLO /i.test(line)) socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
          else if (/^AUTH /i.test(line)) socket.write('235 test authenticated\r\n');
          else if (/^MAIL FROM:/i.test(line) && rejectMail) socket.write('550 test rejection\r\n');
          else if (line === 'DATA') { data = true; socket.write('354 send message\r\n'); }
          else if (line === 'QUIT') socket.end('221 goodbye\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = String((server.address() as AddressInfo).port);
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_USER = 'test-only';
    process.env.SMTP_PASS = 'test-only';
    process.env.MAIL_FROM = 'SaberPlus <sender@example.invalid>';
    process.env.FRONTEND_URL = 'https://example.invalid';
    process.env.VENTAS_NOTIFICACION_CORREO = 'sales@example.invalid';
  });

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    process.env = previousEnv;
    logError.mockRestore();
  });

  function body() {
    const raw = messages[0];
    const content = raw.slice(raw.indexOf('\r\n\r\n') + 4);
    if (/Content-Transfer-Encoding: base64/i.test(raw)) return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8');
    return content.replace(/=\r\n/g, '').replace(/=([A-F0-9]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }

  it('envía verificación: sobre SMTP, HTML escapado y token codificado', async () => {
    await new MailService().enviarVerificacionCorreo('student@example.invalid', '<script>&"', 'a+b/?');
    expect(messages).toHaveLength(1);
    expect(commands).toContain('MAIL FROM:<sender@example.invalid>');
    expect(commands).toContain('RCPT TO:<student@example.invalid>');
    expect(commands.some((line) => line.startsWith('AUTH PLAIN '))).toBe(true);
    expect(body()).toContain('&lt;script&gt;&amp;&quot;');
    expect(body()).toContain('https://example.invalid/verificar-correo?token=a%2Bb%2F%3F');
    expect(body()).not.toContain('<script>');
    expect(logError).not.toHaveBeenCalled();
  });

  it('envía recuperación al titular con la ruta correcta', async () => {
    await new MailService().enviarRecuperacionContrasena('student@example.invalid', 'Nombre', 'recovery+token');
    expect(messages).toHaveLength(1);
    expect(body()).toContain('/restablecer-contrasena?token=recovery%2Btoken');
    expect(commands).toContain('RCPT TO:<student@example.invalid>');
  });

  it('envía lead solo al destinatario configurado y no inyecta encabezados/HTML', async () => {
    await new MailService().enviarNotificacionNuevoLead({
      id: 'local', nombreColegio: 'Colegio\r\nBcc: other@example.invalid',
      nombreContacto: '<img src=x>', correo: 'lead@example.invalid',
      linea: 'COLEGIO', plan: 'PRUEBA', mensaje: '<script>bad</script>',
    });
    expect(messages).toHaveLength(1);
    expect(commands.filter((line) => line.startsWith('RCPT TO:'))).toEqual(['RCPT TO:<sales@example.invalid>']);
    const headers = messages[0].split('\r\n\r\n')[0];
    expect(headers).not.toMatch(/\r\nBcc:/i);
    expect(body()).toContain('&lt;script&gt;bad&lt;/script&gt;');
  });

  it.each(['verification', 'recovery', 'lead'])('mantiene el contrato no fatal ante rechazo SMTP: %s', async (kind) => {
    rejectMail = true;
    const service = new MailService();
    const send = kind === 'verification'
      ? service.enviarVerificacionCorreo('student@example.invalid', 'Name', 'token')
      : kind === 'recovery'
        ? service.enviarRecuperacionContrasena('student@example.invalid', 'Name', 'token')
        : service.enviarNotificacionNuevoLead({ id: 'local', nombreColegio: 'Test', nombreContacto: 'Name', correo: 'lead@example.invalid', linea: 'Test', plan: 'Test' });
    await expect(send).resolves.toBeUndefined();
    expect(messages).toHaveLength(0);
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
