import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { UpdateInstitutionProfileDto } from './institution-profile.dto';
import { InstitutionProfileService } from './institution-profile.service';

@Controller('instituciones/me/perfil')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class InstitutionProfileController {
  constructor(private readonly service: InstitutionProfileService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  own(@Request() req: AuthenticatedRequest) {
    return this.service.own(req.usuario.sub);
  }

  @Patch()
  @Header('Cache-Control', 'private, no-store')
  update(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateInstitutionProfileDto,
  ) {
    return this.service.update(req.usuario.sub, dto);
  }
}
