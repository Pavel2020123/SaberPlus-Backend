import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface CambioTiraAfloja {
  partidaId: string;
  fecha: Date;
}

@Injectable()
export class TiraAflojaRealtimePublisher {
  private readonly cambios = new Subject<CambioTiraAfloja>();

  observar(): Observable<CambioTiraAfloja> {
    return this.cambios.asObservable();
  }

  notificar(partidaId: string): void {
    this.cambios.next({ partidaId, fecha: new Date() });
  }
}
