import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthenticatedUser } from '../../interfaces/user.interface';

/**
 * JWT 守卫 —— HTTP 层统一鉴权。
 * 高级特性演示:
 *  - 元数据驱动:@Public() 标记的接口跳过鉴权(Reflector 读取);
 *  - 将解析出的用户写入 request.user,供 @CurrentUser() 装饰器消费。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const token = this.extractToken(request.headers);

    if (!token) {
      throw new UnauthorizedException('缺少访问令牌');
    }

    return this.authService
      .validateToken(token)
      .then((user: AuthenticatedUser) => {
        (request as unknown as { user?: AuthenticatedUser }).user = user;
        return true;
      })
      .catch(() => {
        throw new UnauthorizedException('令牌无效或已过期');
      });
  }

  private extractToken(headers: Record<string, string>): string | null {
    const auth = headers['authorization'] ?? '';
    const [scheme, token] = auth.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
