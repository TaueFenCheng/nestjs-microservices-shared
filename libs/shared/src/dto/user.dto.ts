import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../interfaces/user.interface';

/** 登录请求 */
export class LoginDto {
  @IsEmail({}, { message: '邮箱格式不正确' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少 6 位' })
  password!: string;
}

/** 登录成功后返回的令牌对 */
export class AuthTokensDto {
  accessToken!: string;
  refreshToken!: string;
  expiresIn!: number;
}

/** 用户概要(跨服务传输,避免把密码哈希等敏感字段带出去) */
export class UserProfileDto {
  id!: string;
  email!: string;
  nickname!: string;
  role!: UserRole;

  @IsOptional()
  avatar?: string;
}
