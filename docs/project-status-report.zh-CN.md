# 项目阶段报告（中文）

本文用于总结当前基于 SequenceServer 的前后端分离改造进度。

补充参考：

- [frontend-replacement-checklist.zh-CN.md](frontend-replacement-checklist.zh-CN.md)
- [release-branding.zh-CN.md](release-branding.zh-CN.md)

## 1. 当前阶段结论

截至当前版本，项目已经完成“第一阶段可运行版本”，并且具备以下特点：

- 后端 `/api/v1/*` 主流程已经打通
- 新前端 `sequenceserver-web` 已经可独立使用
- 数据库导入、索引、BLAST 提交、任务查看、结果查看已经形成闭环
- 本地开发默认按前后端分离方式运行
- OpenAPI / Swagger 文档已经可直接访问

这意味着当前状态已经不是概念验证，而是一套可以继续公开迭代的可用版本。

## 2. 已完成内容

### 2.1 后端 API

已完成的后端能力包括：

#### 数据库接口

- `GET /api/v1/databases`
- `POST /api/v1/databases`
- `POST /api/v1/databases/:id/index`
- `DELETE /api/v1/databases/:id`

#### 数据库任务接口

- `GET /api/v1/database_jobs`
- `GET /api/v1/database_jobs/:id`
- `POST /api/v1/database_jobs/:id/cancel`
- `GET /api/v1/database_jobs/:id/logs/:stream`
- `GET /api/v1/database_jobs/:id/result`

#### BLAST 任务接口

- `POST /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs/:id`
- `GET /api/v1/blast_jobs/:id/input`
- `POST /api/v1/blast_jobs/:id/cancel`
- `GET /api/v1/blast_jobs/:id/logs/:stream`
- `GET /api/v1/blast_jobs/:id/result`
- `GET /api/v1/blast_jobs/:id/download/:type`

#### 其他接口

- `GET /api/v1/sequences`
- `GET /api/v1/sequences/download`
- `POST /api/v1/sequences/download`
- `GET /api/v1/frontend/blast_form`

### 2.2 OpenAPI / Swagger

当前后端已新增文档入口：

- `/api`
- `/api/docs`
- `/api/openapi.json`

这使得浏览器可以直接查看和调试接口，而不再只能手工拼接 URL。

### 2.3 数据库导入与安全控制

当前已支持：

- FASTA 文本导入
- 浏览器上传 FASTA 文件
- 本机路径导入
- 远程 URL 导入
- S3 地址导入
- 数据库删除

同时已实现：

- `allowed_import_paths`
- `allowed_import_urls`
- `allowed_s3_buckets`
- `allowed_origins`

### 2.4 新前端

当前独立前端目录：

- [../sequenceserver-web](../sequenceserver-web)

当前已完成页面：

- `/`
- `/databases`
- `/blast/new`
- `/jobs`
- `/jobs/blast/:id`
- `/jobs/database/:id`

其中已经可用的主线能力包括：

- 数据库导入、索引、删除
- BLAST 提交与历史任务回填
- BLAST / 数据库任务列表
- BLAST 结果页 query 导航
- hit table、alignment、图形概览
- 序列预览、FASTA 下载、结果下载

### 2.5 本地开发模式

当前本地开发默认方式已经明确：

- 前端开发入口：`http://127.0.0.1:5174/`
- 后端 API：`http://127.0.0.1:4567/`
- Swagger UI：`http://127.0.0.1:4567/api/docs`

并且本地配置默认启用：

- `config/sequenceserver.local.conf`
- `api_only: true`

这表示在本地开发时：

- `4567` 不再作为页面入口
- 页面联调走 `5174`
- `4567` 主要承担 API 和接口文档

### 2.6 测试与验证

当前已经完成的验证包括：

- 后端 `spec/routes_spec.rb`
- 后端 `spec/api_routes_spec.rb`
- 前端 `npm run build`
- 前端 `npm run test -- --run`

## 3. 当前架构状态

当前项目仍处于“新旧并存，但主线已经转移”的阶段。

### 新主线

- REST API：`/api/v1/*`
- 文档入口：`/api/docs`
- 独立前端：`sequenceserver-web`

### 仍保留的兼容层

- 旧 `.erb` 页面
- 旧 `searchdata.json`
- 旧 `/:jid.json`
- 旧 `/get_sequence` 和 `/download/:jid.:type`
- `POST /cloud_share`

### 当前判断

- 新前端已经能够承担主流程
- 旧前端已经不是主要入口
- 兼容层还没有完全移除

## 4. 还没有完成的部分

虽然当前版本已经能用，但仍然存在后续工作。

### 4.1 新前端尚未完全替代旧前端全部高级交互

当前结果页已经覆盖主浏览能力，但和旧版相比，仍可继续补：

- 更细致的 BLAST 结果排版对齐
- 旧版少量高级交互或视觉细节

### 4.2 兼容层仍待收口

仍需要后续决定：

- 旧搜索页相关接口是否长期保留
- 旧结果兼容 URL 是否长期保留
- 非 `/api/v1/*` 旧接口是否逐步降级

### 4.3 生产化方案仍可继续加强

仍建议继续完善：

- 权限与认证
- 操作审计
- 更细致的部署方案
- 更完整的发布检查与验收流程

## 5. 当前版本的实际判断

如果按“能否发布一个可用开源版本”来判断，当前答案是：可以。

理由是：

- 核心后端 API 已可用
- 独立前端已可用
- 本地开发方式明确
- 接口文档已可访问
- 版权和协议边界明确

当前更合理的定位是：

- 已达到可用版
- 仍处于快速迭代期
- 后续重点是替代遗留能力和打磨体验，而不是从零开始搭框架

## 6. 相关文档

- [../README.zh-CN.md](../README.zh-CN.md)
- [frontend-replacement-checklist.zh-CN.md](frontend-replacement-checklist.zh-CN.md)
- [frontend-separation-plan.zh-CN.md](frontend-separation-plan.zh-CN.md)
- [frontend-dev-and-deploy.zh-CN.md](frontend-dev-and-deploy.zh-CN.md)
- [release-branding.zh-CN.md](release-branding.zh-CN.md)
