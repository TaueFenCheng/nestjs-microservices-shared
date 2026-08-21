/** 集中式配置(可替换为 yaml / 远程配置中心) */
export default () => ({
  port: Number(process.env.PORT ?? 3000),
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1h',
  },
  microservices: {
    orders: {
      transport: 'redis',
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    billing: {
      transport: 'tcp',
      port: Number(process.env.BILLING_TCP_PORT ?? 4001),
    },
  },
});
