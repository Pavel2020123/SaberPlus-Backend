import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ProfilePhotoRevisionDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'number') return value;
    return typeof value === 'string' && /^(?:0|[1-9]\d{0,9})$/.test(value)
      ? Number(value)
      : Number.NaN;
  })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;
}

export class UploadProfilePhotoDto extends ProfilePhotoRevisionDto {
  @IsUUID('4')
  operacionId!: string;
}
