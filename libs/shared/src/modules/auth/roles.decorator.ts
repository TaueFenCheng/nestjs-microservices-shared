import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../interfaces/user.interface';

/** 元数据 key:声明接口所需角色 */
export const ROLES_KEY = 'roles';

/** 自定义装饰器:@Roles(UserRole.ADMIN) 标记接口仅允许指定角色访问 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
