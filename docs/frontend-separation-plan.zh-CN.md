# 前后端分离重构方案与当前进度（中文）

## 1. 当前架构判断

当前仓库原始形态不是前后端分离架构，而是：

- Sinatra 后端直接返回页面
- 前端脚本以增强方式挂在旧页面上
- 旧页面依赖旧接口格式

典型旧页面与旧逻辑位置：

- [views/search.erb](../views/search.erb)
- [views/report.erb](../views/report.erb)
- [public/js/search.js](../public/js/search.js)
- [public/js/report.js](../public/js/report.js)

因此原项目本质上是“后端渲染 + 前端增强”的混合模式。

## 2. 当前改造目标

当前已经明确采用下面这条路线：

- 保留 Ruby / Sinatra 后端
- 后端对外提供 `/api/v1/*`
- 新建独立前端 `sequenceserver-web`
- 新前端只依赖新 API
- 旧 `.erb` 页面不作为后续主线

也就是说，当前项目已经进入“同仓库内双前端并存、逐步迁移”的阶段：

- 旧页面继续保留
- 新独立前端持续增强

## 3. 后端 API 当前能力

当前后端已经具备前后端分离所需的基础 API。

### 数据库相关

- `GET /api/v1/databases`
- `POST /api/v1/databases`
- `POST /api/v1/databases/:id/index`

### 数据库任务相关

- `GET /api/v1/database_jobs`
- `GET /api/v1/database_jobs/:id`
- `POST /api/v1/database_jobs/:id/cancel`
- `GET /api/v1/database_jobs/:id/logs/:stream`
- `GET /api/v1/database_jobs/:id/result`

### BLAST 任务相关

- `POST /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs/:id`
- `POST /api/v1/blast_jobs/:id/cancel`
- `GET /api/v1/blast_jobs/:id/logs/:stream`
- `GET /api/v1/blast_jobs/:id/result`

## 4. 数据库导入能力

当前数据库导入已经支持多来源：

- `sequence`
  - 直接提交 FASTA 文本
- `multipart/form-data`
  - 浏览器上传文件
- `source.type = local_path`
  - 从服务器本机绝对路径读取
- `source.type = url`
  - 从远程 HTTP/HTTPS 地址读取
- `source.type = s3`
  - 从 `s3://bucket/key` 或预签名地址读取

同时已支持：

- `auto_index`
  - 导入后自动建立 BLAST 索引

## 5. 安全与跨域能力

当前后端已经补齐前后端分离必须的基础安全控制。

### 外部导入白名单

- `allowed_import_paths`
- `allowed_import_urls`
- `allowed_s3_buckets`

默认策略是：

- 文本输入可用
- 文件上传可用
- 本机路径 / URL / S3 默认拒绝

### 跨域访问

已支持：

- `allowed_origins`

这使得独立前端可以通过浏览器跨域访问后端 API。

相关说明文档：

- [docs/api-import-security.md](api-import-security.md)

## 6. 新前端当前状态

当前新前端目录：

- [sequenceserver-web](../sequenceserver-web)

技术栈：

- Vite
- React
- TypeScript
- React Router

当前已经完成的页面：

### 首页仪表盘

路径：

- `/`

当前功能：

- 显示数据库数量
- 显示运行中 / 排队中 / 失败任务数量
- 显示最近数据库
- 显示最近 BLAST 任务
- 显示最近数据库索引任务
- 提供快捷入口

### 数据库管理页

路径：

- `/databases`

当前功能：

- 查看当前数据库列表
- 文本导入 FASTA
- 文件上传导入 FASTA
- 本机路径导入
- URL 导入
- S3 导入
- 自动索引
- 手动索引
- 导入后显示任务链接

### BLAST 提交页

路径：

- `/blast/new`

当前功能：

- 输入查询序列
- 选择一个或多个数据库
- 根据数据库类型限制可用 BLAST 方法
- 防止混选不同类型数据库
- 设置高级参数
- 提交任务后自动跳转详情页

### 任务中心

路径：

- `/jobs`

当前功能：

- 查看 BLAST 任务列表
- 查看数据库索引任务列表
- 状态筛选
- 自动刷新
- 最近刷新时间显示
- 最近失败 / 已取消任务
- 最近活跃任务

### BLAST 任务详情页

路径：

- `/jobs/blast/:id`

当前功能：

- 任务状态查看
- 自动刷新
- 手动刷新
- 取消任务
- stdout / stderr 日志
- 日志摘要
- BLAST 结果摘要
- 原始 JSON 查看

### 数据库索引任务详情页

路径：

- `/jobs/database/:id`

当前功能：

- 任务状态查看
- 自动刷新
- 手动刷新
- 取消任务
- stdout / stderr 日志
- 日志摘要
- 索引结果摘要
- 原始 JSON 查看

## 7. 当前阶段结论

截至当前版本，可以认为：

- 后端 API 主流程已经打通
- 新前端 6 个核心页面已经全部完成第一版
- 前后端分离结构已经从“方案阶段”进入“可运行阶段”

也就是说，当前已经不是只有设计图，而是已经有一套：

- 能启动
- 能联调
- 能提交任务
- 能管理数据库
- 能查看结果

的独立前端基础版本。

## 8. 仍建议保留旧页面

虽然新前端已经可运行，但当前仍建议：

1. 暂时保留旧 `.erb` 页面
2. 把新前端作为新架构主线继续增强
3. 等新前端足够稳定后，再决定是否彻底替换旧界面

原因：

- 旧页面仍可作为兼容入口
- 新前端还缺少部分增强功能
- 平滑迁移的风险更低

## 9. 下一阶段建议

下一阶段建议优先做下面几类增强。

### 第一优先级

- 更完整的 BLAST 结果可视化
- 下载 / 导出能力
- 更细粒度的错误展示
- 部署与联调文档补齐

### 第二优先级

- 任务重试
- 批量任务操作
- 数据库删除 / 更新能力
- 前端状态管理抽象

### 第三优先级

- 登录与权限体系
- 多用户隔离
- 国际化
- 更完整的运维监控页

## 10. 相关文件

新前端主目录：

- [sequenceserver-web](../sequenceserver-web)

后端 API 路由：

- [lib/sequenceserver/api/v1/routes.rb](../lib/sequenceserver/api/v1/routes.rb)

后端 API 帮助函数：

- [lib/sequenceserver/api/v1/helpers.rb](../lib/sequenceserver/api/v1/helpers.rb)

导入器与白名单逻辑：

- [lib/sequenceserver/database_importer.rb](../lib/sequenceserver/database_importer.rb)
- [lib/sequenceserver/config.rb](../lib/sequenceserver/config.rb)

前端启动说明：

- [sequenceserver-web/README.md](../sequenceserver-web/README.md)

项目阶段总结：

- [docs/project-status-report.zh-CN.md](project-status-report.zh-CN.md)
