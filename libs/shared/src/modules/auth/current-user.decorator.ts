import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../interfaces/user.interface';

/**
 * 参数装饰器:从请求中取出已认证用户。
 * 用法:
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * 高级特性:createParamDecorator 可以在装饰器中做复杂解析,
 * 甚至可以注入自定义校验逻辑。
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
