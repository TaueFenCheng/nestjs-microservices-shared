import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../interfaces/user.interface';
import { ROLES_KEY } from './roles.decorator';

/**
 * 角色守卫 —— 基于 @Roles() 元数据的授权。
 * 与 JwtAuthGuard 配合:先鉴权(JwtAuthGuard 填充 request.user),
 * 再鉴权 RolesGuard 读取 @Roles 声明的角色做比较。
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // 没有声明 @Roles 的接口默认放行(鉴权由 JwtAuthGuard 保证)
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: { role: UserRole } }>();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('没有访问该资源的权限');
    }
    return true;
  }
}
