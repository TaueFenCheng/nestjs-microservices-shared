import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedUser, JwtPayload, UserRole } from '../../interfaces/user.interface';

export interface AuthOptions {
  secret: string;
  expiresIn: string | number;
}

/**
 * 统一鉴权服务。
 * 各微服务共享同一 JWT_SECRET(通过 AuthModule.forRoot 注入),
 * 因此 token 由网关签发、微服务各自校验,无需回源用户中心。
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('AUTH_OPTIONS') private readonly options: AuthOptions,
  ) {}

  /** 签发访问令牌(登录成功后由网关调用) */
  async signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.signAsync(payload);
  }

  /** 校验令牌并解析用户上下文 */
  async validateToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role ?? UserRole.USER,
    };
  }

  /** 生成服务间调用的内部令牌(可选,配合 ClientProxy 透传) */
  async signInternalToken(serviceName: string, ttlSeconds = 60): Promise<string> {
    return this.jwtService.signAsync(
      { sub: `internal:${serviceName}`, role: UserRole.OPERATOR },
      { expiresIn: ttlSeconds },
    );
  }
}
