/** 用户角色,鉴权守卫与业务逻辑共用 */
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
}

/** JWT payload 标准结构(解析后注入 request.user) */
export interface JwtPayload {
  sub: string; // 用户 ID
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** 已认证用户上下文(CurrentUser 装饰器返回) */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
