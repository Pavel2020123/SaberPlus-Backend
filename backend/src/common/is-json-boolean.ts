import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/** A JSON body must say true/false, never truthy strings such as "false". */
export function IsJsonBoolean(): PropertyDecorator {
  return applyDecorators(
    Transform(
      ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
      { toClassOnly: true },
    ),
    IsBoolean(),
  );
}
