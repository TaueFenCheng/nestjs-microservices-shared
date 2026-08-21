import { DynamicModule, Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AuthService } from './auth.service';

export interface AuthModuleOptions {
  secret: string;
  expiresIn?: string | number;
  /** 是否注册为全局模块(默认 true,各微服务共享同一套鉴权) */
  global?: boolean;
}

/**
 * 鉴权模块 —— 动态模块 + JwtModule 集成的示例。
 *
 * 使用:
 *   AuthModule.forRoot({ secret: process.env.JWT_SECRET, expiresIn: '1h' })
 *
 * 全局注册后,每个微服务的 guard 都能注入 AuthService:
 *   - HTTP 服务:JwtAuthGuard 校验 Authorization: Bearer <token>
 *   - 微服务之间:AuthService.sign() 生成内部令牌,ClientProxy 调用时透传
 */
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    const jwtOptions: JwtModuleOptions = {
      secret: options.secret,
      signOptions: { expiresIn: (options.expiresIn ?? '1h') as unknown as number | StringValue },
    };

    return {
      module: AuthModule,
      global: options.global ?? true,
      imports: [JwtModule.register(jwtOptions)],
      providers: [
        {
          provide: 'AUTH_OPTIONS',
          useValue: { secret: options.secret, expiresIn: options.expiresIn ?? '1h' },
        },
        AuthService,
      ],
      exports: [AuthService],
    };
  }
}
