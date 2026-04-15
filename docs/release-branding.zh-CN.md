# 发布命名与版权说明

本文档用于明确这个二次开发版本对外发布时的项目命名、仓库命名、协议和 README 声明方式。

## 1. 推荐名称

建议继续使用：

- 对外项目名：`SequenceServer API`
- GitHub 仓库名：`sequenceserver-api`
- 代码内部名称：继续保留 `sequenceserver`

这样做的好处是：

- 能清楚表达这是基于 SequenceServer 的 API 化 / 前后端分离版本
- 不会和上游完全重名
- 不需要在当前阶段强行改动内部 gem 名、命令名和历史路径

## 2. 当前版本定位

按现在的完成度，更合理的版本定位是：

- 已经可以发布可用版本
- 仍处于持续迭代阶段

推荐首个版本号：

- `v0.1.0`

## 3. 协议建议

建议继续保持与上游一致：

- 协议：`AGPL-3.0`

理由很直接：

- 上游已是 `AGPL-3.0`
- 你当前项目是基于上游的继续修改版本
- 继续保持同协议最稳妥，也最清晰

## 4. 发布时建议保留的文件

建议保留：

- [../LICENSE.txt](../LICENSE.txt)
- [../COPYRIGHT.txt](../COPYRIGHT.txt)
- [../LICENSE](../LICENSE)

## 5. README 中建议明确的内容

当前 README 建议至少写清楚这几件事：

- 这是基于 SequenceServer 的二次开发版本
- 当前主线是 API + 独立前端
- 本地开发默认走前后端分离
- 后端已提供 Swagger / OpenAPI 文档入口
- 协议保持 `AGPL-3.0`

## 6. 建议放在 README 里的简洁声明

建议在 README 中保留类似文字：

```text
SequenceServer API is based on SequenceServer.
This project remains licensed under AGPL-3.0.
See LICENSE.txt and COPYRIGHT.txt for upstream and derivative-work notices.
```

## 7. 建议放在 README 或发布说明中的当前版本说明

如果你要对外说明当前版本状态，建议用更贴近现状的写法：

```text
SequenceServer API is a fork of SequenceServer focused on REST APIs and a separated frontend.
This repository keeps upstream licensing and attribution, while adding API routes, a new frontend, and OpenAPI documentation.
```

## 8. 当前最稳妥的发布方案

建议当前版本按下面方式发布：

- 项目名使用 `SequenceServer API`
- 仓库名使用 `sequenceserver-api`
- 协议继续使用 `AGPL-3.0`
- 保留上游版权说明和许可证文件
- 中文 README 作为主入口
- 明确说明当前版本已可用，但仍在持续替代遗留兼容层

## 9. 相关文档

- 主 README：[../README.zh-CN.md](../README.zh-CN.md)
- 项目阶段报告：[project-status-report.zh-CN.md](project-status-report.zh-CN.md)
- 前端替换清单：[frontend-replacement-checklist.zh-CN.md](frontend-replacement-checklist.zh-CN.md)
