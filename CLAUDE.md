# CLAUDE.md

> 本文件供 Claude（及其它 AI 协作者）在本仓库工作时快速 onboarding。
> 项目为 monorepo，分 `client/`（Next.js 前端）与 `server/`（NestJS 后端）。

---

## 1. 项目概述

`finance_next` 是一个**加密货币 / 期权策略管理工具**的原型，帮助交易者维护
策略配置（杠杆、止盈止损、分批补仓比例、交易所 API 凭证），并通过自有后端
持久化到 MongoDB Atlas。当前仅完成了 `Option`（策略配置）资源的 CRUD 链路，
真正的订单执行、账户管理、自动化下单逻辑尚未实现。

## 2. 技术栈

**前端 `client/`**
- Next.js 16（App Router, Turbopack）· React 19 · TypeScript 5.6
- HeroUI 2.8（原 NextUI） · Tailwind CSS 4（CSS-first 配置）· Framer Motion 12
- ESLint 9（flat config，`eslint.config.mjs`）

**后端 `server/`**
- NestJS 11 · TypeScript 6
- Mongoose 9（MongoDB Atlas）
- class-validator / class-transformer（DTO 校验）
- Jest 30 + Supertest 7
- ESLint 9（flat config，`eslint.config.mjs`）

## 3. 目录结构

```
finance_next/
├── client/
│   ├── app/                          # Next App Router
│   │   ├── page.tsx                  # 首页（导航到 api-list）
│   │   ├── layout.tsx                # 全局 NextUI Provider + 字体
│   │   ├── option/page.tsx           # 期权策略表单页
│   │   ├── api-list/                 # 策略列表（async server component）
│   │   └── list/                     # 占位，功能未实现
│   ├── data/
│   │   ├── type.d.ts                 # TypeOption 等共享类型
│   │   ├── data.ts                   # 聚合入口（按 NODE_ENV 切换 mock/real）
│   │   ├── data-mock.ts              # "mock" 实现（实际仍 fetch 后端，见 §7）
│   │   └── data-real.ts              # 真实 fetch 实现
│   ├── next.config.mjs · tailwind.config.ts · tsconfig.json
└── server/
    ├── src/
    │   ├── main.ts                   # bootstrap：globalPrefix=api, port=3001
    │   ├── app.module.ts             # MongoDB 连接 + RouterModule(v1)
    │   └── routers/option/
    │       ├── option.module.ts
    │       ├── option.controller.ts  # CRUD 端点
    │       ├── option.service.ts
    │       ├── entities/option.entity.ts
    │       └── dto/{create,update}-option.dto.ts
    └── nest-cli.json · tsconfig.json
```

## 4. 常用命令

```bash
# 前端
cd client
yarn dev        # 开发
yarn build      # 构建
yarn start      # 生产启动
yarn lint

# 后端
cd server
yarn dev        # 等价 yarn start:dev，nest --watch
yarn build
yarn start:prod
yarn test       # 单测
yarn test:e2e
yarn lint
yarn format
```

## 5. 数据模型与 API

**端口与前缀**
- 后端监听 `:3001`（`server/src/main.ts:9`）
- 全局前缀 `api`（`server/src/main.ts:7`）
- 资源前缀 `v1`（`server/src/app.module.ts` 中 `RouterModule.register`）
- 前端 baseUrl：`http://localhost:3001/api`（`client/data/data-real.ts:3`）

**Option 资源**（`server/src/routers/option/option.controller.ts`）
| 方法     | 路径                  | 说明                                |
| ------ | ------------------- | --------------------------------- |
| GET    | `/api/v1/option`    | 列表                                |
| GET    | `/api/v1/option/:id`| 详情                                |
| POST   | `/api/v1/option`    | 创建，返回 `{ message, value: { name } }` |
| PUT    | `/api/v1/option/:id`| 更新                                |
| DELETE | `/api/v1/option/:id`| 删除                                |

**Option 字段**（以 `CreateOptionDto` 为准，`client/data/type.d.ts` 与之对应）
- `name`（3-8 字符，唯一）
- `positionLevel`（杠杆，1-125）
- `openPositionStopTime`（开仓未成交停止时间，分钟）
- `execSymbol`（交易对，如 `BTCUSDT`）
- `orderGroupMargin`（订单组保证金）
- `stopProfitRate` / `stopLossRate`（止盈/止损比例）
- `profitRateAfterAtAddPosition`（补仓后止盈降低比例）
- `createCostOrderInProfit`（止盈后是否创建保本单）
- `createPositions: [{ marginRate, lossAddRate }]`（分批开仓/补仓配置）
- `userEmail` / `userApiKey` / `userSecretKey`（交易所凭证）

DTO 校验由 `app.useGlobalPipes(new ValidationPipe())` 在请求层生效。

## 6. 前端数据访问

`client/data/data.ts` 按 `process.env.NODE_ENV === 'production'` 在
`data-mock` 与 `data-real` 间切换。`api-list` 页面是 async server component，
直接在服务端调用 `getOptions()`。`option/page.tsx` 仅有表单 UI，尚未接 POST 提交。

## 7. 安全与配置

- **环境变量**（`server/.env`，参考 `server/.env.example`）：
  - `MONGODB_URI` — 完整 Mongo 连接串（含库名）
  - `ENCRYPTION_KEY` — 32 字节十六进制（64 字符）。生成：
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **凭证加密**：`server/src/common/crypto.service.ts` 提供 AES-256-GCM
  封装；`OptionService` 在 create / update 时透明加密 `userApiKey` 与
  `userSecretKey`，密文格式 `iv.tag.ciphertext`（base64 三段）。
- **接口防泄露**：`option.entity.ts` 的 `toJSON.transform` 主动剥除
  `userApiKey` / `userSecretKey`，GET 接口永不返回密钥（即便已加密）。

## 8. 注意事项 / 已知问题

- **mock 形同虚设**：`client/data/data-mock.ts` 与 `data-real.ts` 实现一致，
  开发态切换目前没有任何离线效果。
- **POST 缺显式 Content-Type**：`client/data/data-real.ts:10` 的 fetch
  未设置 `Content-Type: application/json`，目前依赖 NestJS 默认 JSON 解析。
- **`client/app/list/`** 为占位目录。

## 9. 当前进度 / TODO

- [x] Option CRUD（Controller / Service / DTO 校验）
- [x] 前端期权配置表单 UI
- [x] 前端策略列表 server component
- [x] 补全 `option.entity.ts` Schema（含 `createPositions` 子文档）
- [x] 凭证加密 + 环境变量化连接串
- [ ] 期权配置表单接通 POST 提交
- [ ] `client/app/list/` 实现
- [ ] 订单执行 / 账户管理 / 自动化下单
