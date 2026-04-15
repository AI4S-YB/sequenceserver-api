# SequenceServer Web

这是当前仓库中新建的独立前端项目，用于把 SequenceServer 改造成真正的前后端分离结构。

前端技术栈：

- Vite
- React
- TypeScript
- React Router

前端只调用后端 `/api/v1/*` 接口，不再依赖旧的 `.erb` 页面和旧接口格式。

## 当前已完成页面

当前已经完成一版可运行、可联调的新前端页面：

- `/`
  - 系统首页仪表盘
  - 显示数据库数量、最近任务、快捷入口
- `/databases`
  - 数据库管理页
  - 支持文本导入、文件上传、本机路径、URL、S3
  - 支持自动建索引、手动建索引、删除数据库
- `/blast/new`
  - BLAST 提交页
  - 支持数据库多选
  - 支持方法联动限制
  - 提交后自动跳转详情页
- `/jobs`
  - 任务中心
  - 支持状态筛选、自动刷新、失败任务查看、活跃任务查看
- `/jobs/blast/:id`
  - BLAST 任务详情页
  - 支持状态轮询、取消、日志查看、结果摘要
- `/jobs/database/:id`
  - 数据库索引任务详情页
  - 支持状态轮询、取消、日志查看、索引结果摘要

## 默认后端地址

当前前端默认通过下面地址访问后端 API：

```bash
http://127.0.0.1:4567
```

如果前端和后端最终走同域反向代理，也支持把 `VITE_API_BASE_URL` 配置为空字符串，直接访问相对路径 `/api/v1/*`。

对应环境变量文件：

```bash
.env.example
```

内容：

```bash
VITE_API_BASE_URL=http://127.0.0.1:4567
```

## 启动方式

当前项目默认内置：

- 项目内置数据库目录：`../data/blast-db`
- BLAST 搜索页示例序列：`../data/examples/blast-query`
- 默认本地后端配置：`../config/sequenceserver.local.conf`

### 1. 安装依赖

```bash
npm install
```

### 2. 配置后端地址

复制环境变量文件：

```bash
cp .env.example .env
```

如果后端地址不是默认值，请修改：

```bash
VITE_API_BASE_URL=http://127.0.0.1:4567
```

### 3. 启动开发服务器

```bash
npm run dev
```

默认前端开发地址通常为：

```bash
http://127.0.0.1:5174
```

### 4. 构建生产包

```bash
npm run build
```

构建产物输出到：

```bash
dist/
```

### 5. 运行前端测试

```bash
npm run test
```

## 后端联调要求

为了让独立前端能访问后端 API，后端需要配置允许的来源。

配置文件：

```yaml
~/.sequenceserver.conf
```

至少建议加入：

```yaml
allowed_origins:
  - http://127.0.0.1:5174
  - http://localhost:5174
```

如果以后前端部署到其他域名，也需要把对应来源加入这里。

## 外部导入相关说明

数据库管理页已经支持以下导入方式：

- 直接输入 FASTA 文本
- 浏览器上传文件
- 本机路径 `local_path`
- 远程 URL `url`
- S3 地址 `s3`

其中：

- 文本输入和文件上传默认可用
- 本机路径、URL、S3 默认是关闭的
- 只有后端配置了白名单后才允许使用

相关后端白名单配置：

```yaml
allowed_import_paths: []
allowed_import_urls: []
allowed_s3_buckets: []
```

详细说明见：

- [docs/api-import-security.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/api-import-security.md)

## 当前适合的使用方式

当前这套新前端已经适合做以下工作：

- 本地前后端分离联调
- 作为新开源项目的前端基础骨架继续开发
- 与现有 Sinatra/Ruby 后端 API 对接
- 在不改旧页面主流程的前提下持续演进新架构

## 当前还没有做完的部分

当前前端已经具备主流程，但仍有后续增强空间：

- 更完整的 BLAST 结果图形化展示
- 下载、导出、分享能力
- 鉴权、用户体系、权限控制
- 更细粒度的错误提示
- 任务重试、批量操作

## 相关文档

- [docs/frontend-separation-plan.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-separation-plan.zh-CN.md)
- [docs/api-import-security.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/api-import-security.md)
- [docs/project-status-report.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/project-status-report.zh-CN.md)
- [docs/frontend-replacement-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-replacement-checklist.zh-CN.md)
