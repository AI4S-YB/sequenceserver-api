# SequenceServer API

基于 SequenceServer 的前后端分离与开放接口版。

本仓库当前以中文文档为主，GitHub 首页入口优先使用中文 README。

## 主入口

- 中文主 README: [README.zh-CN.md](README.zh-CN.md)
- 项目阶段报告: [docs/project-status-report.zh-CN.md](docs/project-status-report.zh-CN.md)
- 前端替换清单: [docs/frontend-replacement-checklist.zh-CN.md](docs/frontend-replacement-checklist.zh-CN.md)
- 发布命名与版权说明: [docs/release-branding.zh-CN.md](docs/release-branding.zh-CN.md)

## 当前可用能力

- 后端已提供 `/api/v1/*` REST API
- 已提供 OpenAPI / Swagger 文档入口
- 新前端 `sequenceserver-web` 已覆盖数据库管理、BLAST 提交、任务中心和结果主浏览
- 本地开发模式默认采用“前端走 `5174`，后端走 `4567` API”的分离方式

## 本地开发入口

- 前端开发地址: `http://127.0.0.1:5174/`
- API 文档入口: `http://127.0.0.1:4567/api`
- Swagger UI: `http://127.0.0.1:4567/api/docs`
- OpenAPI JSON: `http://127.0.0.1:4567/api/openapi.json`

当前本地开发配置默认启用 `api_only: true`，因此：

- `http://127.0.0.1:4567/` 不再作为页面入口
- `4567` 主要用于 API 和接口文档
- 页面开发与联调请使用 `5174`

## 协议与版权

本项目基于上游 SequenceServer 进行二次开发，并继续保持与上游一致的 `AGPL-3.0` 协议。

- [LICENSE.txt](LICENSE.txt)
- [COPYRIGHT.txt](COPYRIGHT.txt)

## English

The Chinese documentation is the primary entry for this fork.

- English overview: [README.en.md](README.en.md)
- Chinese main README: [README.zh-CN.md](README.zh-CN.md)
