# 项目命名与版权发布建议

本文档用于确定这个二次开发版本对外发布时的项目名称、仓库命名、协议与版权声明写法。

## 推荐项目名

推荐使用：`SequenceServer API`

推荐理由：

- 与上游 `SequenceServer` 保持清晰关联
- 直接体现本次二次开发的核心方向是 API 化和前后端分离
- 名称足够稳妥，适合尽快发布第一个可用版本
- 后续即使继续扩展任务系统、数据库管理和外部集成，这个名字也不会很快过时

## 备选名称

- `SequenceServer Next`
- `SequenceServer Open`
- `SequenceServer Platform`
- `SequenceServer Flex`

如果目标是尽快发布且避免名字过于营销化，优先还是建议 `SequenceServer API`。

## 命名落地建议

建议分三层处理：

- 对外项目名：`SequenceServer API`
- GitHub 仓库名：`sequenceserver-api`
- 代码内部名：暂时继续保留 `sequenceserver`

这样做的原因是：

- 对外品牌已经能体现新版方向
- 仓库命名清晰，不会和上游完全重名
- 内部 gem 名、命令名、历史路径先不动，避免引入不必要的兼容性风险

## 版本建议

如果准备尽快发布一个可用版，建议首个版本号使用：

- `v0.1.0`

这个版本号表达的是：

- 已经可以使用
- 主流程已经打通
- 仍处于持续替代旧前端、补齐高级能力的阶段

## 协议建议

建议保持与上游完全一致：

- 协议：`AGPL-3.0`

原因：

- 上游 `sequenceserver.gemspec` 已明确声明为 `AGPL-3.0`
- 仓库包含 `LICENSE.txt` 的 GNU Affero General Public License v3 文本
- `COPYRIGHT.txt` 已声明上游版权归属与相关组件许可信息
- 你计划把这个项目作为开源服务器公开发布，继续使用同协议最稳妥

## 这是否支持你修改并开源

支持。

你可以基于当前代码继续修改，并将修改后的版本公开到 GitHub 开源发布，但需要满足以下要求：

- 保留并遵守 `AGPL-3.0`
- 保留上游版权与许可证声明
- 明确说明这是基于上游 SequenceServer 的修改版
- 如果你把修改版作为网络服务对外提供，AGPL 也要求把对应源码向使用者开放

## 发布时建议保留的文件

以下文件建议直接保留，不要删除：

- `LICENSE.txt`
- `COPYRIGHT.txt`
- `LICENSE/`

其中：

- `LICENSE.txt` 是主许可证文本
- `COPYRIGHT.txt` 记录上游版权说明
- `LICENSE/` 目录保存部分第三方组件许可证

## README 中建议加入的声明

建议在公开仓库的 README 中加入如下文字：

```text
SequenceServer API is based on SequenceServer and remains licensed under AGPL-3.0.
This repository contains additional API and frontend-separation work built on top of the upstream project.
See LICENSE.txt and COPYRIGHT.txt for license and attribution details.
```

## 版权声明模板

如果你准备在 README、关于页面或发布说明里放一段简洁版权声明，建议使用下面这种写法：

```text
SequenceServer API
Copyright (C) 2026 <Your Name or Organization>

This project is based on SequenceServer.
Portions of this software are derived from the upstream SequenceServer project.
Upstream copyright includes Anurag Priyam, Ben J Woodcroft and Yannick Wurm.

Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).
See LICENSE.txt and COPYRIGHT.txt for details.
```

如果你不想在当前阶段新增自己的单独版权文件，也可以先保留上游 `COPYRIGHT.txt`，并仅在 README 中补充 fork / 二次开发说明。

## 当前最稳妥的发布方案

建议先按下面方式发布第一个版本：

- 项目名使用 `SequenceServer API`
- 仓库名使用 `sequenceserver-api`
- 协议继续使用 `AGPL-3.0`
- 保留上游版权说明与许可证文件
- README 明确写明这是基于 SequenceServer 的前后端分离改造版
- 版本号使用 `v0.1.0`

这样可以在不破坏上游兼容性的前提下，尽快发布一个清晰、合规、可继续演进的开源版本。
