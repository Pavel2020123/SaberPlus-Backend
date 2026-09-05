import { TiraAflojaRealtimePublisher } from './tira-afloja-realtime.publisher';

describe('TiraAflojaRealtimePublisher', () => {
  it('publica el identificador y la hora del cambio', () => {
    const publisher = new TiraAflojaRealtimePublisher();
    const recibido = jest.fn();
    const suscripcion = publisher.observar().subscribe(recibido);

    publisher.notificar('partida-1');

    expect(recibido).toHaveBeenCalledTimes(1);
    expect(recibido).toHaveBeenCalledWith({
      partidaId: 'partida-1',
      fecha: expect.any(Date) as Date,
    });
    suscripcion.unsubscribe();
  });
});
