import { SetMetadata } from '@nestjs/common';

/** 元数据 key:标记公开接口 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 自定义装饰器:@Public() 标记的接口跳过 JwtAuthGuard。
 * 用法:
 *   @Public()
 *   @Get('health')
 *   health() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
