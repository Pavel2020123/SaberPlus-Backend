import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SimulacroModule } from './simulacro/simulacro.module';
import { AdminModule } from './admin/admin.module';
import { InstitucionModule } from './institucion/institucion.module';
import { CalendarioIcfesModule } from './calendario-icfes/calendario-icfes.module';
import { PagosModule } from './pagos/pagos.module';
import { VentasModule } from './ventas/ventas.module';
import { CuponesModule } from './cupones/cupones.module';
import { DiagnosticoModule } from './diagnostico/diagnostico.module';
import { ReferidosModule } from './referidos/referidos.module';
import { SoporteModule } from './soporte/soporte.module';
import { PlanEstudioModule } from './plan-estudio/plan-estudio.module';
import { TutorialModule } from './tutorial/tutorial.module';
import { AnunciosModule } from './anuncios/anuncios.module';
import { RankingModule } from './ranking/ranking.module';
import { GamificacionModule } from './gamificacion/gamificacion.module';
import { BatallasModule } from './batallas/batallas.module';
import { CuadernoErroresModule } from './cuaderno-errores/cuaderno-errores.module';
import { TiraAflojaModule } from './tira-afloja/tira-afloja.module';
import { TriviaRushModule } from './trivia-rush/trivia-rush.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SimulacroModule,
    AdminModule,
    InstitucionModule,
    CalendarioIcfesModule,
    PagosModule,
    VentasModule,
    CuponesModule,
    DiagnosticoModule,
    ReferidosModule,
    SoporteModule,
    PlanEstudioModule,
    TutorialModule,
    AnunciosModule,
    RankingModule,
    GamificacionModule,
    BatallasModule,
    CuadernoErroresModule,
    TiraAflojaModule,
    TriviaRushModule,
  ],
  controllers: [AppController, HealthController],
})
export class AppModule {}
