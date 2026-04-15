# 新前端页面级活体验证报告

本文档记录当前这套前后端分离版本，在本地联调环境中的页面级活体验证结果。

## 本次联调环境

- 日期：2026-04-14
- 后端地址：`http://127.0.0.1:4567`
- 前端地址：`http://127.0.0.1:5174`
- 说明：当前前端开发配置已固定为 `5174`，用于避免与其它本机应用冲突

## 本次联调的临时前提

为了让本地开发环境先跑起来，这次联调使用了 `tmp/` 下的临时开发配置：

- `tmp/dev.sequenceserver.conf`
- `tmp/blast-bin/blastdbcmd`
- `tmp/dev-db/`

原因：

- 本机 BLAST+ 实际版本是 `2.15.0+`
- 当前仓库启动检查要求 `2.16.0+`
- 因此本次只做了本地临时联调适配，没有修改仓库正式逻辑

## 已完成的真实联调

### 1. 系统与跨域

已验证：

- 后端首页 `GET /` 返回 `200`
- 前端开发服务首页返回 `200`
- `GET /api/v1/frontend/blast_form` 返回 `200`
- 后端对 `http://127.0.0.1:5174` 的 CORS 放行已经生效

### 2. BLAST 主流程

已真实完成：

- 读取数据库列表
- 读取搜索表单配置
- 提交一个真实 BLAST 任务
- 轮询任务状态直到完成
- 读取结果 JSON
- 读取任务回填输入
- 下载 XML 结果
- 读取 stderr 日志

本次真实 BLAST 任务 ID：

- `4e3c6bbe-4037-4b41-8498-d5270fcd1085`

结果：

- 任务成功完成
- `GET /api/v1/blast_jobs/:id/result` 正常返回
- `GET /api/v1/blast_jobs/:id/input` 正常返回
- `GET /api/v1/blast_jobs/:id/download/xml` 正常返回

### 3. 数据库管理主流程

已真实完成：

- 新增数据库 FASTA
- 自动提交建索引任务
- 查询索引任务状态
- 查询索引结果
- 在数据库列表中看到新数据库
- 删除数据库及其索引副文件

本次真实数据库索引任务 ID：

- `c57530fc-ba8e-4674-a9bf-aea0a94441af`

本次真实数据库 ID：

- `2a254475b1bb84d181df46eeb3203276`

结果：

- 数据库新增成功
- 索引成功
- 删除时连 `.nin`、`.nsq`、`.nhr` 等副文件一起删除

## 页面级判断

下面的结论分为三类：

- 已活体验证：已经通过运行中的前后端和真实 API 流程验证
- 代码已接通：页面代码已经接了 API，但这次还没有做浏览器交互级点击验证
- 尚未覆盖：当前还没有完全完成或没有做足够验证

### `/` 首页仪表盘

状态：代码已接通

已接 API：

- `GET /api/v1/databases`
- `GET /api/v1/blast_jobs`
- `GET /api/v1/database_jobs`

当前判断：

- 页面代码已经接通真实 API
- 指标卡片、最近任务、最近数据库都已有数据来源
- 本次没有逐按钮做浏览器点击验证

### `/databases`

状态：已活体验证

已接 API：

- `GET /api/v1/databases`
- `POST /api/v1/databases`
- `POST /api/v1/databases/:id/index`
- `DELETE /api/v1/databases/:id`

已验证通过：

- 直接输入 FASTA 创建数据库
- 自动建索引
- 手动查看索引任务
- 删除数据库

代码已接通但这次未做真实外部源验证：

- 浏览器文件上传
- 本机路径导入
- 远程 URL 导入
- S3 导入

说明：

- 这些模式在代码里已经接了 API
- 但它们依赖上传文件或白名单策略，本次没有额外准备真实外部来源

### `/blast/new`

状态：主流程已活体验证

已接 API：

- `GET /api/v1/frontend/blast_form`
- `POST /api/v1/blast_jobs`
- `GET /api/v1/blast_jobs/:id/input`

已验证通过：

- 搜索表单配置 API 正常
- 提交真实 BLAST 任务成功
- 旧任务回填接口可用

代码已接通但本次未逐项浏览器验证：

- 页面上的多数据库选择与方法联动
- “在新标签页打开结果”
- FASTQ 自动转 FASTA 的输入交互体验

说明：

- 这些能力在页面代码中存在
- 但本次主要是 API 与主流程烟雾验证，不是浏览器行为级验收

### `/jobs`

状态：已活体验证

已接 API：

- `GET /api/v1/blast_jobs`
- `GET /api/v1/database_jobs`

已验证通过：

- BLAST 任务列表
- 数据库索引任务列表
- limit 参数
- 已完成任务可出现在列表中

代码已接通但本次未做完整浏览器筛选验证：

- 关键词搜索
- 状态筛选
- 自动刷新开关

### `/jobs/blast/:id`

状态：主流程已活体验证

已接 API：

- `GET /api/v1/blast_jobs/:id`
- `GET /api/v1/blast_jobs/:id/result`
- `GET /api/v1/blast_jobs/:id/logs/:stream`
- `POST /api/v1/blast_jobs/:id/cancel`
- `GET /api/v1/sequences`
- `POST /api/v1/sequences/download`
- `GET /api/v1/blast_jobs/:id/download/:type`

已验证通过：

- 任务状态查询
- 结果 JSON 返回
- 任务输入回填
- XML 下载
- stderr 日志读取

代码已接通但本次未做浏览器可视化级验证：

- 图形总览
- 单 hit alignment
- Circos 总览
- Query 锚点导航
- 命中序列预览
- 复制链接与邮件分享
- 大结果 warning 卡片的页面交互

说明：

- 这些逻辑和组件都已经在页面代码中存在
- 但本次没有逐个在浏览器中点开确认视觉和交互细节

### `/jobs/database/:id`

状态：主流程已活体验证

已接 API：

- `GET /api/v1/database_jobs/:id`
- `GET /api/v1/database_jobs/:id/result`
- `GET /api/v1/database_jobs/:id/logs/:stream`
- `POST /api/v1/database_jobs/:id/cancel`

已验证通过：

- 索引任务状态
- 索引结果
- 任务列表可见

代码已接通但本次未做完整浏览器交互验证：

- 页面内“后续操作”跳转链路
- 页面内取消按钮的视觉反馈

## 当前结论

如果把目标定义为“尽快发布一个可用版本”，当前可以认为：

- 后端 API 主流程可用
- 新前端主页面已经完成
- BLAST 与数据库管理的关键闭环已经可用
- 当前版本已经具备“可运行、可联调、可演示主流程”的条件

## 当前仍然建议补的高优先级事项

### 1. 正规化本机 BLAST 环境

当前本地联调依赖临时 wrapper，不适合作为正式部署方案。

建议：

- 安装或切换到真实的 `BLAST+ 2.16.0+`
- 去掉 `tmp/blast-bin/` 这一层临时适配

### 2. 做一次浏览器人工验收

建议重点点击验证：

- `/blast/new` 的方法联动
- `/blast/new?from_job=...` 的回填体验
- `/jobs/blast/:id` 的图形概览和序列预览
- `/databases` 的上传、本机路径、URL、S3 四类导入表单反馈

### 3. 补充页面级自动化测试

当前已有一些前端单元测试，但还缺真正覆盖页面工作流的自动化验证。

建议后续增加：

- 任务提交流程测试
- 结果详情页加载测试
- 数据库创建与索引流程测试

## 建议的下一步

最值得继续推进的是：

- 基于正在运行的前后端，做一次“新前端替代旧前端”的浏览器人工验收清单

这样可以更明确回答：

- 哪些页面已经可以直接给用户用
- 哪些页面只是接口打通但交互还要补
- 发布前还差哪几处真正影响使用体验的问题
