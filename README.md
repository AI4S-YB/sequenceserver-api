# SequenceServer API

基于 SequenceServer 的前后端分离与开放接口版。

本仓库当前以中文说明为主，GitHub 首页入口信息优先使用中文文档。

## 主入口

- 中文主 README: [README.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/README.zh-CN.md)
- 项目阶段报告: [docs/project-status-report.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/project-status-report.zh-CN.md)
- 前端替换清单: [docs/frontend-replacement-checklist.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/frontend-replacement-checklist.zh-CN.md)
- 发布命名与版权说明: [docs/release-branding.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/docs/release-branding.zh-CN.md)

## 项目简介

这是一个基于上游 SequenceServer 的二次开发版本，目标是把原本“后端渲染页面 + 前端增强”的结构，逐步改造成更适合开放集成和二次开发的前后端分离架构。

当前改造重点包括：

- 新增 `/api/v1/*` REST API
- 新增独立前端 `sequenceserver-web`
- 支持通过 API 导入数据库、建立索引、提交 BLAST 任务、查看任务和结果
- 支持本机路径、远程 URL、S3 等多种导入来源

## 当前状态

当前已经完成第一阶段可运行版本：

- 后端 API 主流程已经打通
- 独立前端主页面已经完成
- 数据库导入、建索引、BLAST 提交、任务查看、结果查看已经形成闭环
- 中文开发、部署、联调文档已经补齐

## 协议与版权

本项目基于上游 SequenceServer 进行二次开发，继续保持与上游一致的 `AGPL-3.0` 协议。

请保留并参考以下文件：

- [LICENSE.txt](/Users/kentnf/projects/omicsagent/sequenceserver/LICENSE.txt)
- [COPYRIGHT.txt](/Users/kentnf/projects/omicsagent/sequenceserver/COPYRIGHT.txt)

## English

The Chinese documentation is now the primary project entry for this fork.

- English overview: [README.en.md](/Users/kentnf/projects/omicsagent/sequenceserver/README.en.md)
- Chinese main README: [README.zh-CN.md](/Users/kentnf/projects/omicsagent/sequenceserver/README.zh-CN.md)
