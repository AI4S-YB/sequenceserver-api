# SequenceServer API

副标题建议：`基于 SequenceServer 的前后端分离与开放接口版`

这是一个基于上游 SequenceServer 的二次开发版本，目标是把原本“后端渲染页面 + 前端增强”的结构，逐步改造成适合二次开发、开放集成和独立部署的前后端分离架构。

当前对外项目名建议使用 `SequenceServer API`。为了降低兼容性风险，代码内部名称、Ruby gem 名称、默认命令名仍保持 `sequenceserver` 不变。

## 主入口

- 项目阶段报告: [docs/project-status-report.zh-CN.md](docs/project-status-report.zh-CN.md)
- 前端替换清单: [docs/frontend-replacement-checklist.zh-CN.md](docs/frontend-replacement-checklist.zh-CN.md)
- 发布命名与版权说明: [docs/release-branding.zh-CN.md](docs/release-branding.zh-CN.md)

## 当前阶段

截至当前版本，这个项目已经不是接口草图或概念验证，而是一个可以启动、联调、演示、继续迭代的第一阶段可运行版本。

已经形成闭环的部分包括：

- `/api/v1/*` REST API 主流程
- 独立前端 `sequenceserver-web`
- 数据库导入、建索引、删除
- BLAST 提交、任务跟踪、结果查看、结果下载
- OpenAPI / Swagger 文档入口
- 中文开发、部署、联调文档

## 当前已完成能力

### 1. 后端 API

已完成的主要接口包括：

- `GET /api/v1/databases`
- `POST /api/v1/databases`
- `POST /api/v1/databases/:id/index`
- `DELETE /api/v1/databases/:id`
- `GET /api/v1/database_jobs`
- `GET /api/v1/database_jobs/:id`
- `POST /api/v1/database_jobs/:id/cancel`
- `GET /api/v1/database_jobs/:id/logs/:stream`
- `GET /api/v1/database_jobs/:id/result`
- `POST /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs/:id`
- `GET /api/v1/blast_jobs/:id/input`
- `POST /api/v1/blast_jobs/:id/cancel`
- `GET /api/v1/blast_jobs/:id/logs/:stream`
- `GET /api/v1/blast_jobs/:id/result`
- `GET /api/v1/blast_jobs/:id/download/:type`
- `GET /api/v1/sequences`
- `GET /api/v1/sequences/download`
- `POST /api/v1/sequences/download`
- `GET /api/v1/frontend/blast_form`

### 2. API 文档

现在已经提供接口文档入口：

- API 文档首页: `http://127.0.0.1:4567/api`
- Swagger UI: `http://127.0.0.1:4567/api/docs`
- OpenAPI JSON: `http://127.0.0.1:4567/api/openapi.json`

### 3. 数据库导入来源

当前已支持：

- FASTA 文本
- 浏览器文件上传
- 本机路径
- 远程 URL
- S3 地址
- 数据库删除

并支持：

- `auto_index`
- 白名单安全控制：
  - `allowed_import_paths`
  - `allowed_import_urls`
  - `allowed_s3_buckets`
  - `allowed_origins`

### 4. 独立前端页面

当前新前端已完成：

- `/`
- `/databases`
- `/blast/new`
- `/jobs`
- `/jobs/blast/:id`
- `/jobs/database/:id`

其中 BLAST 结果页已经具备：

- query 级导航
- hit table
- alignment 浏览
- 命中序列预览与 FASTA 下载
- 图形概览
- 大结果 warning
- 结果下载

## 快速开始

### 1. 开发环境启动

推荐直接使用仓库脚本：

```bash
bash scripts/dev-start.sh
```

开发脚本会启动：

- 前端：`http://127.0.0.1:5174/`
- 后端 API：`http://127.0.0.1:4567/`

当前本地默认开发配置启用了 `config/sequenceserver.local.conf` 中的 `api_only: true`，因此：

- `http://127.0.0.1:4567/` 默认不再提供页面入口
- 页面开发、联调和热更新走 `5174`
- `4567` 主要用于 API、任务执行和 Swagger 文档

开发环境的常用入口：

- 前端页面：`http://127.0.0.1:5174/`
- API 文档：`http://127.0.0.1:4567/api/docs`

### 2. 生产环境启动

```bash
bash scripts/prod-start.sh
```

生产脚本会先构建 `sequenceserver-web/dist`，再启动 Ruby 后端。

默认情况下，生产环境可以继续由 Ruby 后端托管前端构建产物；如果你希望做严格前后端分离，也可以保留 `api_only` 模式，仅让后端提供 API。

### 3. 手动启动

```bash
bundle install
bundle exec bin/sequenceserver -c config/sequenceserver.local.conf
```

```bash
cd sequenceserver-web
npm install
npm run dev
```

## 文档索引

### 项目总览

- [docs/project-status-report.zh-CN.md](docs/project-status-report.zh-CN.md)
- [docs/frontend-replacement-checklist.zh-CN.md](docs/frontend-replacement-checklist.zh-CN.md)
- [docs/release-branding.zh-CN.md](docs/release-branding.zh-CN.md)

### 前后端分离与部署

- [docs/frontend-separation-plan.zh-CN.md](docs/frontend-separation-plan.zh-CN.md)
- [docs/frontend-dev-and-deploy.zh-CN.md](docs/frontend-dev-and-deploy.zh-CN.md)
- [docs/api-import-security.md](docs/api-import-security.md)
- [docs/frontend-nginx-example.zh-CN.md](docs/frontend-nginx-example.zh-CN.md)
- [docs/frontend-docker-compose.zh-CN.md](docs/frontend-docker-compose.zh-CN.md)
- [docs/frontend-release-checklist.zh-CN.md](docs/frontend-release-checklist.zh-CN.md)

### 验证与验收

- [docs/frontend-live-smoke-report.zh-CN.md](docs/frontend-live-smoke-report.zh-CN.md)
- [docs/frontend-manual-acceptance-checklist.zh-CN.md](docs/frontend-manual-acceptance-checklist.zh-CN.md)

## 当前仍待继续完善

虽然主流程已经能用，但还没有完全结束，当前仍建议继续推进：

- 新前端进一步替代旧前端剩余高级交互
- BLAST 结果页与旧版视觉细节继续对齐
- 更完整的权限、审计和生产部署策略
- 兼容层与旧接口的长期收口方案

## 开源说明

本项目基于上游 SequenceServer 进行二次开发。

如果你准备继续公开发布，请保持：

- 与上游一致的 `AGPL-3.0`
- 保留 [LICENSE.txt](LICENSE.txt)
- 保留 [COPYRIGHT.txt](COPYRIGHT.txt)
- 在 README 中明确说明这是基于 SequenceServer 的 fork / 二次开发版本

建议在对外仓库中保留类似说明：

```text
SequenceServer API is based on SequenceServer.
This project remains licensed under AGPL-3.0.
See LICENSE.txt and COPYRIGHT.txt for upstream and derivative-work notices.
```

## 相关目录

- 示例数据：[data](data)
- 后端 API 路由：[lib/sequenceserver/api/v1/routes.rb](lib/sequenceserver/api/v1/routes.rb)
- API 辅助序列化：[lib/sequenceserver/api/v1/helpers.rb](lib/sequenceserver/api/v1/helpers.rb)
- 独立前端：[sequenceserver-web](sequenceserver-web)
- OpenAPI 文档：[docs/openapi.json](docs/openapi.json)
