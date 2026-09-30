import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn() })) }));

describe('Configuración SMTP de MailService', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; jest.clearAllMocks(); });

  it.each([
    ['true', '465', true, 465],
    ['false', '587', false, 587],
    [undefined, undefined, false, 587],
  ])('conserva secure=%s y puerto=%s sin desactivar TLS', (secure, port, expectedSecure, expectedPort) => {
    process.env.SMTP_HOST = 'smtp.example.invalid';
    process.env.SMTP_USER = 'test-only';
    process.env.SMTP_PASS = 'test-only';
    if (secure === undefined) delete process.env.SMTP_SECURE;
    else process.env.SMTP_SECURE = secure as string;
    if (port === undefined) delete process.env.SMTP_PORT;
    else process.env.SMTP_PORT = port as string;
    new MailService();
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.invalid', port: expectedPort, secure: expectedSecure,
      auth: { user: 'test-only', pass: 'test-only' },
    });
  });
});
