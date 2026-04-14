# 旧前端剩余功能缺口分析（中文）

本文用于说明三件事：

- 旧前端还剩哪些功能
- 这些功能在新前端是否已经覆盖
- 如果未覆盖，是否需要新增接口

## 1. 结论

当前旧前端剩余功能可以分成三类：

### 1.1 不缺接口，主要是前端交互还没搬过去

- Query 锚点导航
- Previous / Next Query
- 复制当前结果页 URL
- mailto 分享结果链接
- FASTQ 自动识别并转 FASTA
- 结果在新标签页打开

其中本轮已经完成迁移：

- FASTQ 自动识别并转 FASTA
- 复制当前结果页 URL
- 邮件分享结果链接
- Query 锚点导航
- Previous / Next Query
- 结果在新标签页打开

### 1.2 建议新增接口

- 基于旧任务重新编辑搜索

这个接口已经完成。

### 1.3 需要产品/架构决策，不一定是接口问题

- 是否保留旧插件体系
- 是否保留旧搜索配置接口
- 旧兼容接口保留多久

## 2. 旧前端还剩的主要功能

### 2.1 搜索页

- `/searchdata.json` 初始化数据库列表、数据库树、默认 options
- `job_id` 回填旧任务参数
- FASTQ 自动转 FASTA
- 提交时可选择结果在新标签页打开

其中本轮新增：

- `GET /api/v1/frontend/blast_form`
- 新前端已开始接入该接口获取表单配置

### 2.2 结果页

- `/:jid.json` 轮询结果
- 大结果 warning 页面
- Query 锚点导航
- Previous / Next Query
- 复制 URL
- mailto 分享
- Edit search
- New search
- 大结果 warning 页面

### 2.3 结果辅助功能

- 下载全部 hits FASTA
- 下载勾选 hits FASTA
- 查看单条命中序列
- 结果格式下载
- `cloud_share`

### 2.4 扩展机制

- SearchHeaderPlugin
- ReportPlugins
- HitButtons
- DownloadLinks

## 3. 已经有新 API 的功能

这些能力不需要新增接口：

- 命中序列查看
  - `GET /api/v1/sequences`
- FASTA 下载
  - `GET /api/v1/sequences/download`
  - `POST /api/v1/sequences/download`
- 结果下载
  - `GET /api/v1/blast_jobs/:id/download/:type`
- BLAST 任务状态、日志、取消、结果
  - `GET /api/v1/blast_jobs/:id`
  - `GET /api/v1/blast_jobs/:id/logs/:stream`
  - `POST /api/v1/blast_jobs/:id/cancel`
  - `GET /api/v1/blast_jobs/:id/result`

结论：

- 这些功能没完全覆盖时，主要是新前端还没把体验搬过去

## 4. 建议新增的接口

### 4.1 `GET /api/v1/blast_jobs/:id/input`

用途：

- 支持从旧任务回填搜索表单
- 支持新前端“重新编辑搜索”

建议返回：

- `id`
- `sequence`
- `method`
- `advanced`
- `databases`
- `database_ids`
- `submitted_at`

当前状态：

- 已完成
- 新前端已接入

## 5. 可以后续再决定的接口

### 5.1 搜索页配置接口

- `GET /api/v1/frontend/blast_form`

当前状态：

- `databases`
- `database_tree`
- `blast_task_map`
- `options`
- `methods`

这个接口已经完成，当前新前端已开始接入。

## 6. 不一定需要接口的功能

下面这些更偏前端实现：

- Query 目录与锚点跳转
- Previous / Next Query
- 复制链接
- mailto 分享
- FASTQ 自动转换
- 新标签页打开结果

## 7. 建议的下一步

建议优先顺序：

1. 先做 `GET /api/v1/blast_jobs/:id/input`
2. 再决定是否保留旧插件体系
3. 评估旧兼容接口的退役顺序
4. 如果仍需要扩展能力，单独设计新前端扩展点
