# SequenceServer API

副标题建议使用：`基于 SequenceServer 的前后端分离与开放接口版`

这是一个基于上游 SequenceServer 进行二次开发的版本，目标是把原本“后端渲染页面 + 前端增强”的结构，逐步改造成更适合二次开发和开放集成的前后端分离架构。

项目对外名称建议使用 `SequenceServer API`。现阶段为了兼容上游和降低迁移风险，代码内部名称、Ruby gem 名称、默认命令名仍保持 `sequenceserver` 不变。

当前改造重点包括：

- 新增 `/api/v1/*` REST API
- 新增独立前端 `sequenceserver-web`
- 支持通过 API 导入数据库、建立索引、提交 BLAST 任务、查看任务和结果
- 支持为外部导入增加白名单和安全控制

## 当前状态

截至当前版本，项目已经完成第一阶段可运行版本：

- 后端 API 主流程已经打通
- 独立前端主页面已经完成
- 数据库导入、建索引、BLAST 提交、任务查看、结果查看已经形成闭环
- 中文开发、部署、联调文档已经补齐
- 前端已经有最基础的自动化测试

更详细的阶段总结见：

- [docs/project-status-report.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/project-status-report.zh-CN.md)
- [docs/frontend-replacement-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-replacement-checklist.zh-CN.md)

## 当前已完成功能

### 后端 API

已完成：

- `GET /api/v1/databases`
- `POST /api/v1/databases`
- `POST /api/v1/databases/:id/index`
- `GET /api/v1/database_jobs`
- `GET /api/v1/database_jobs/:id`
- `POST /api/v1/database_jobs/:id/cancel`
- `GET /api/v1/database_jobs/:id/logs/:stream`
- `GET /api/v1/database_jobs/:id/result`
- `POST /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs/:id`
- `POST /api/v1/blast_jobs/:id/cancel`
- `GET /api/v1/blast_jobs/:id/logs/:stream`
- `GET /api/v1/blast_jobs/:id/result`

### 数据库导入来源

已支持：

- FASTA 文本
- 浏览器文件上传
- 本机路径
- 远程 URL
- S3 地址
- 数据库删除

### 独立前端页面

已完成：

- `/`
- `/databases`
- `/blast/new`
- `/jobs`
- `/jobs/blast/:id`
- `/jobs/database/:id`

## 快速开始

### 1. 开发环境启动

推荐直接使用仓库内脚本：

```bash
bash scripts/dev-start.sh
```

开发脚本会同时启动：

- 后端：`http://127.0.0.1:4567`
- 前端：`http://127.0.0.1:5174`
- 前端使用 Vite 开发服务器，修改前端代码后可即时热更新
- 后端默认使用 `config/sequenceserver.local.conf`
- 默认数据库目录使用项目内置的 `data/blast-db`
- BLAST 搜索页默认示例序列使用项目内置的拟南芥 mRNA / 蛋白示例

说明：

- 前端改动可以立即看到
- Ruby 后端代码改动仍需要重启开发脚本
- 如需切换开发配置文件，可设置环境变量 `SEQUENCESERVER_DEV_CONFIG=/path/to/your.conf`

### 2. 生产环境启动

```bash
bash scripts/prod-start.sh
```

生产脚本会：

- 先构建 `sequenceserver-web/dist`
- 再启动 Ruby 后端
- 默认让前端通过同域相对路径访问 `/api/v1/*`

可选环境变量：

- `SEQUENCESERVER_PROD_CONFIG=/path/to/prod.conf`
- `PROD_VITE_API_BASE_URL=https://your-api.example.org`
- `SKIP_FRONTEND_BUILD=1`

### 3. 手动启动方式

如果你希望分别手动启动，也可以：

```bash
bundle install
bundle exec bin/sequenceserver
```

```bash
cd sequenceserver-web
npm install
npm run dev
```

当前前端默认开发地址已固定为：

```bash
http://127.0.0.1:5174
```

### 4. 配置跨域

后端配置文件：

```yaml
config/sequenceserver.local.conf
```

建议至少加入：

```yaml
allowed_origins:
  - http://127.0.0.1:5174
  - http://localhost:5174
```

## 部署与联调文档

已整理好的中文文档：

- [docs/frontend-separation-plan.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-separation-plan.zh-CN.md)
- [docs/frontend-dev-and-deploy.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-dev-and-deploy.zh-CN.md)
- [docs/api-import-security.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/api-import-security.md)
- [docs/frontend-nginx-example.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-nginx-example.zh-CN.md)
- [docs/frontend-docker-compose.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-docker-compose.zh-CN.md)
- [docs/frontend-release-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-release-checklist.zh-CN.md)
- [docs/project-status-report.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/project-status-report.zh-CN.md)
- [docs/frontend-replacement-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-replacement-checklist.zh-CN.md)
- [docs/frontend-live-smoke-report.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-live-smoke-report.zh-CN.md)
- [docs/frontend-manual-acceptance-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-manual-acceptance-checklist.zh-CN.md)

## 当前还未完成的重点

当前主流程已经能运行，但仍建议继续完善：

- 更完整的 BLAST 结果可视化
- 下载 / 导出能力
- 数据库删除 / 更新
- 任务重试与批量操作
- 登录和权限体系
- 更完整的生产化方案

## 开源说明

本项目基于上游 SequenceServer 进行二次开发。

如果你计划将该项目继续公开发布，请注意：

- 保持与上游一致的 `AGPL-3.0` 协议
- 保留 `LICENSE.txt` 与 `COPYRIGHT.txt`
- 在 README 中明确说明与上游关系
- 明确标注这是基于 SequenceServer 的 fork / 二次开发版本
- 清楚区分“已完成功能”和“后续路线图”

建议公开仓库时使用以下说明：

```text
SequenceServer API is based on SequenceServer.
This project remains licensed under AGPL-3.0.
See LICENSE.txt and COPYRIGHT.txt for upstream and derivative-work notices.
```

更完整的项目命名、仓库命名、版权声明模板见：

- [docs/release-branding.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/release-branding.zh-CN.md)

## 相关目录

- 项目内置示例数据：
  - [data](/Users/kentnf/projects/omicsagent/sequenceserver/data)
- 后端 API：
  - [lib/sequenceserver/api/v1/routes.rb](/Users/kentnf/projects/omicsagent/sequenceserver/lib/sequenceserver/api/v1/routes.rb)
- 独立前端：
  - [sequenceserver-web](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web)
- 项目阶段报告：
  - [docs/project-status-report.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/project-status-report.zh-CN.md)
