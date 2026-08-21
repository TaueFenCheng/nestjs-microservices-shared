import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

/**
 * 全局验证管道 —— 基于 class-validator + class-transformer。
 * 自动将请求载荷转成 DTO 实例并校验,失败抛 400。
 *
 * 用法(全局注册):
 *   app.useGlobalPipes(new SharedValidationPipe());
 *
 * 与共享 DTO 配合:所有微服务的入参校验规则同源,规则变更一处生效。
 */
@Injectable()
export class SharedValidationPipe implements PipeTransform<unknown, Promise<unknown>> {
  async transform(value: unknown, { metatype }: ArgumentMetadata): Promise<unknown> {
    if (!metatype || !this.toValidate(metatype)) {
      return value;
    }

    const object = plainToInstance(metatype as new () => unknown, value, {
      enableImplicitConversion: true,
    });
    const errors: ValidationError[] = await validate(object as object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      const messages = errors
        .map((e) => Object.values(e.constraints ?? {}).join('; '))
        .join(' | ');
      throw new BadRequestException(messages);
    }
    return object;
  }

  private toValidate(metatype: unknown): boolean {
    const types = [String, Boolean, Number, Array, Object];
    return !types.includes(metatype as never);
  }
}
