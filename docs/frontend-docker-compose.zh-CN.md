# 前后端分离 Docker Compose 示例（中文）

本文说明仓库中新增的：

- [docker-compose.frontend-api.yml](/Users/kentnf/projects/omicsagent/sequenceserver/docker-compose.frontend-api.yml)

这个文件用于快速启动：

- 一个 SequenceServer 后端 API 容器
- 一个独立前端静态站点容器

## 1. 当前示例采用的方式

这份示例采用的是“分离端口”模式：

- 前端：`http://localhost:8080`
- 后端：`http://localhost:4567`

因此前端构建时会把：

```bash
VITE_API_BASE_URL=http://localhost:4567
```

写进前端产物。

这意味着：

- 适合本机快速联调
- 配置简单
- 但浏览器访问仍然是跨域模式

所以后端仍然需要配置：

```yaml
allowed_origins:
  - http://localhost:8080
```

## 2. 使用前准备

你至少需要准备：

- Docker
- 后端配置文件 `~/.sequenceserver.conf`
- 一个本机数据库目录 `./db`

建议最小配置示例：

```yaml
database_dir: /db
allowed_origins:
  - http://localhost:8080
```

如果以后要开放本机路径、URL、S3 导入，再继续补：

- `allowed_import_paths`
- `allowed_import_urls`
- `allowed_s3_buckets`

## 3. 启动方式

在仓库根目录运行：

```bash
docker compose -f docker-compose.frontend-api.yml up --build
```

启动后：

- 前端访问：`http://localhost:8080`
- 后端 API：`http://localhost:4567`

## 4. compose 文件包含什么

### `api` 服务

使用根目录：

- [Dockerfile](/Users/kentnf/projects/omicsagent/sequenceserver/Dockerfile)

启动 Ruby / Sinatra 后端。

挂载：

- `./db:/db`
- `~/.sequenceserver.conf:/root/.sequenceserver.conf:ro`

### `web` 服务

使用前端目录：

- [sequenceserver-web/Dockerfile](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/Dockerfile)

把 React 前端构建成静态站点，并通过 Nginx 提供访问。

## 5. 当前前端 Dockerfile 说明

前端镜像使用两阶段构建：

### 第一阶段

- `node:20-alpine`
- 安装依赖
- 执行 `npm run build`

### 第二阶段

- `nginx:1.27-alpine`
- 提供静态文件
- 支持 React Router 的前端路由刷新

相关文件：

- [sequenceserver-web/Dockerfile](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/Dockerfile)
- [sequenceserver-web/nginx.conf](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/nginx.conf)

## 6. 如果你想改成同域代理模式

如果你希望最终生产环境是：

- `https://blast.example.org/` 前端
- `https://blast.example.org/api/v1/*` 后端

那更适合使用 Nginx 反向代理方式，而不是当前这份分离端口 compose 示例。

这种情况下建议参考：

- [docs/frontend-nginx-example.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-nginx-example.zh-CN.md)

同时前端也可以把：

```bash
VITE_API_BASE_URL=
```

设置为空字符串，走相对路径访问 API。

## 7. 当前这份 compose 的定位

这份 compose 更适合：

- 本地开发联调
- 快速演示
- 在公开仓库中提供一个最小可运行示例

它还不是完整的生产编排方案。

## 8. 生产环境仍建议补充的内容

如果用于正式环境，后续仍建议继续补：

- HTTPS
- Nginx / Caddy 外层网关
- 日志持久化
- 更明确的数据库卷管理
- 健康检查
- 监控与告警

## 9. 相关文件

- [docker-compose.frontend-api.yml](/Users/kentnf/projects/omicsagent/sequenceserver/docker-compose.frontend-api.yml)
- [sequenceserver-web/Dockerfile](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/Dockerfile)
- [sequenceserver-web/nginx.conf](/Users/kentnf/projects/omicsagent/sequenceserver/sequenceserver-web/nginx.conf)
- [docs/frontend-nginx-example.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-nginx-example.zh-CN.md)
