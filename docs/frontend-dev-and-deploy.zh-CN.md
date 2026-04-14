# 独立前端开发与部署说明（中文）

本文面向当前已经改造出的独立前端：

- [sequenceserver-web](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web)

目标是帮助你快速完成：

- 本地联调
- 前后端分离开发
- 简单部署

## 1. 前提

当前架构分为两部分：

### 后端

- Ruby / Sinatra
- 提供 `/api/v1/*`
- 负责数据库导入、建索引、BLAST 任务、日志和结果

### 前端

- Vite + React + TypeScript
- 独立运行在开发服务器或静态站点
- 通过 `VITE_API_BASE_URL` 访问后端

## 2. 前端目录

前端目录：

- [sequenceserver-web](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web)

常用文件：

- [sequenceserver-web/package.json](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/package.json)
- [sequenceserver-web/.env.example](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/.env.example)
- [sequenceserver-web/src/lib/config.ts](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/src/lib/config.ts)

## 3. 本地开发启动

### 第一步：安装前端依赖

```bash
cd sequenceserver-web
npm install
```

### 第二步：配置 API 地址

复制环境变量文件：

```bash
cp .env.example .env
```

默认内容：

```bash
VITE_API_BASE_URL=http://127.0.0.1:4567
```

如果你的后端不是这个地址，就改成实际地址。

### 第三步：启动前端开发服务器

```bash
npm run dev
```

默认开发地址一般是：

```bash
http://127.0.0.1:5173
```

## 4. 后端跨域配置

因为前端和后端是分开的，浏览器访问会涉及跨域。

后端配置文件：

```yaml
~/.sequenceserver.conf
```

至少建议加入：

```yaml
allowed_origins:
  - http://127.0.0.1:5173
  - http://localhost:5173
```

如果前端部署在正式域名，例如：

```yaml
allowed_origins:
  - https://blast.example.org
```

也要把正式域名加入这里。

## 5. 外部导入白名单

数据库管理页支持以下来源：

- 文本输入
- 文件上传
- 本机路径
- URL
- S3

其中：

- 文本输入、文件上传默认可用
- 本机路径、URL、S3 默认拒绝

如果你要开放这些来源，需要在后端配置文件加入白名单。

示例：

```yaml
allowed_import_paths:
  - /data/blast-imports

allowed_import_urls:
  - https://example-bucket.s3.amazonaws.com/

allowed_s3_buckets:
  - my-bucket
```

详细说明见：

- [docs/api-import-security.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/api-import-security.md)

## 6. 常见联调检查项

如果前端打不开数据，优先检查下面几项。

### 1. 后端是否已启动

先确认后端服务确实在监听你配置的地址和端口。

### 2. `VITE_API_BASE_URL` 是否正确

前端请求的地址来自：

- [sequenceserver-web/src/lib/config.ts](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/src/lib/config.ts)

### 3. `allowed_origins` 是否包含当前前端地址

如果没有包含，浏览器会被 CORS 拦截。

### 4. 外部导入白名单是否已经配置

如果使用：

- 本机路径
- URL
- S3

但白名单没配置，后端会返回拒绝错误。

### 5. 后端任务是否真正执行成功

如果任务提交成功但没有结果，要去任务详情页查看：

- stdout
- stderr
- 退出码

## 7. 当前推荐部署方式

当前新前端最适合采用以下方式部署。

### 方案 A：本地开发联调

- 前端用 `npm run dev`
- 后端本地运行
- 使用 `allowed_origins` 放行本地开发地址

适合当前开发阶段。

### 方案 B：前端构建后静态部署

```bash
cd sequenceserver-web
npm run build
```

构建产物在：

```bash
sequenceserver-web/dist
```

然后把 `dist/` 部署到任意静态服务器即可，例如：

- Nginx
- Caddy
- Apache
- 对象存储静态站点

注意：

- 后端仍然独立运行
- 前端部署域名要加入 `allowed_origins`
- `VITE_API_BASE_URL` 要指向正式后端地址

更具体的 Nginx 反向代理示例见：

- [docs/frontend-nginx-example.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-nginx-example.zh-CN.md)

### 方案 C：使用 Docker Compose 快速拉起前后端

仓库中已经新增示例：

- [docker-compose.frontend-api.yml](/Users/kentnf/projects/omicsagent/sequenceserver/docker-compose.frontend-api.yml)

对应说明：

- [docs/frontend-docker-compose.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-docker-compose.zh-CN.md)

## 8. 当前页面能力概览

### `/`

- 系统总览
- 最近任务
- 最近数据库

### `/databases`

- 多来源导入
- 自动 / 手动索引

### `/blast/new`

- BLAST 任务提交
- 多数据库选择
- 方法联动限制

### `/jobs`

- 任务中心
- 状态筛选
- 自动刷新

### `/jobs/blast/:id`

- BLAST 任务详情
- 日志
- 结果摘要

### `/jobs/database/:id`

- 数据库索引任务详情
- 日志
- 索引结果摘要

## 9. 当前仍待增强的部分

虽然当前主流程已通，但后续仍建议继续完善：

- 更完整的 BLAST 结果图形化
- 下载 / 导出
- 鉴权
- 更完整的部署方案
- 批量任务管理

## 10. 相关文档

- [sequenceserver-web/README.md](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/README.md)
- [docs/frontend-separation-plan.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-separation-plan.zh-CN.md)
- [docs/api-import-security.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/api-import-security.md)
- [docs/frontend-nginx-example.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-nginx-example.zh-CN.md)
- [docs/frontend-docker-compose.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-docker-compose.zh-CN.md)
- [docs/frontend-release-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-release-checklist.zh-CN.md)
