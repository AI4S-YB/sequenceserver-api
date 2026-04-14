# 旧兼容接口与插件机制审计（中文）

本文用于回答两个收口阶段最关键的问题：

- 旧兼容接口现在还剩什么
- 旧前端插件机制到底还值不值得保留

目标不是抽象讨论，而是给出可以直接执行的判断依据。

## 1. 当前结论

截至目前，旧前端剩余工作已经集中到两类：

- 兼容接口收口
- 插件机制取舍

换句话说，主流程页面本身已经大体迁到新前端，真正还没决定的是：

- 哪些旧接口只是历史包袱
- 哪些旧扩展点还需要新的替代方案

## 2. 旧兼容接口清单

### 2.1 旧搜索页相关

- `GET /searchdata.json`
- `POST /`

现状：

- 新前端主流程已经不依赖这两条旧接口
- `GET /api/v1/frontend/blast_form` 已经开始承接旧 `searchdata.json` 的表单配置职责
- `POST /` 仍然是旧 HTML 搜索页的提交入口

判断：

- `GET /searchdata.json`
  - 建议状态：兼容保留，后续可退役
  - 原因：新前端已有 `GET /api/v1/frontend/blast_form`
- `POST /`
  - 建议状态：兼容保留，后续可退役
  - 原因：新前端主提交流程已经是 `POST /api/v1/blast_jobs`

### 2.2 旧结果页相关

- `GET /:jid`
- `GET /:jid.json`

现状：

- `GET /:jid` 默认已跳到 `/jobs/blast/:id`
- `GET /:jid.json` 仍服务于旧结果页轮询
- 新前端结果页已经使用 `GET /api/v1/blast_jobs/:id/result`

判断：

- `GET /:jid`
  - 建议状态：短中期保留兼容跳转
  - 原因：对旧链接友好，迁移风险最低
- `GET /:jid.json`
  - 建议状态：兼容保留，后续可退役
  - 原因：新前端主流程已不依赖

### 2.3 旧结果辅助接口

- `GET /get_sequence/`
- `POST /get_sequence`
- `GET /download/:jid.:type`
- `POST /cloud_share`

现状：

- 前三者都已经被新 API 替代
- `cloud_share` 已按当前策略在前端隐藏，但后端保留

对应替代：

- `GET /api/v1/sequences`
- `GET /api/v1/sequences/download`
- `POST /api/v1/sequences/download`
- `GET /api/v1/blast_jobs/:id/download/:type`

判断：

- `/get_sequence*`
  - 建议状态：兼容保留，后续可退役
- `/download/:jid.:type`
  - 建议状态：兼容保留，后续可退役
- `/cloud_share`
  - 建议状态：后端保留，前端停用
  - 原因：已经是明确的产品策略，不是技术阻塞

## 3. 旧插件机制审计

旧前端当前存在 4 个主要扩展点。

### 3.1 `SearchHeaderPlugin`

代码位置：

- [search.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/search.js)
- [search_header_plugin.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/null_plugins/search_header_plugin.js)

作用：

- 在旧搜索页顶部插入自定义内容

本质判断：

- 这是纯前端插槽，不依赖特定后端接口

建议：

- 如果你的二次开发没有“给搜索页顶部挂自定义业务组件”的需求，可以删除
- 如果以后你希望挂公告、项目说明、额外过滤条件，建议改造成新前端插槽组件，而不是保留旧插件装载方式

### 3.2 `ReportPlugins`

代码位置：

- [report.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/report.js)
- [graphical_overview.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/report/graphical_overview.js)
- [report_plugins.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/null_plugins/report_plugins.js)

作用：

- 初始化结果页插件逻辑
- 在 query 结果区域插入额外内容
- 在图形总览区域生成额外统计图

本质判断：

- 这是旧结果页最“像框架”的扩展点
- 但它绑定的是旧 React 组件结构和旧报告页渲染过程

建议：

- 不建议原样保留
- 如果未来确实需要扩展能力，建议在新前端定义更简单的扩展模型，例如：
  - 结果页顶部扩展卡片
  - query 级扩展面板
  - 图形概览扩展卡片

### 3.3 `HitButtons`

代码位置：

- [hit.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/hit.js)
- [hit_buttons.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/null_plugins/hit_buttons.js)

作用：

- 给单条 hit 增加额外按钮

本质判断：

- 这是最容易迁移的一类插件
- 也是最有可能在你的二次开发里真正有用的一类扩展点

适合的场景：

- 跳转到外部注释系统
- 打开基因组浏览器
- 调用你自己的下游分析服务

建议：

- 不保留旧插件加载机制
- 但建议以后给新前端设计一个“hit 操作按钮扩展点”
- 如果后面你明确需要，我可以直接给新前端设计一套静态配置版或接口驱动版的 hit action 模型

### 3.4 `DownloadLinks`

代码位置：

- [sidebar.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/sidebar.js)
- [download_links.js](/Users/kentnf/projects/omicsagent/sequenceserver/public/js/null_plugins/download_links.js)

作用：

- 在旧结果页下载区域追加额外链接

本质判断：

- 也是一种 UI 扩展，而不是底层能力扩展

建议：

- 如果只是补几个固定下载链接，直接在新前端结果页写死或走配置即可
- 不值得单独保留旧插件体系

## 4. 保留 / 改造 / 删除 建议

### 4.1 旧兼容接口

- 保留
  - `GET /:jid`
  - 适用：你还要兼顾旧链接
  - 成本：低
- 改造
  - `GET /searchdata.json`
  - `GET /:jid.json`
  - `GET /get_sequence/`
  - `POST /get_sequence`
  - `GET /download/:jid.:type`
  - 适用：逐步转成“仅兼容层”
  - 成本：中
- 删除
  - `POST /`
  - 最终目标是只保留 API 提交
  - 适用：确认不再公开旧搜索页时
  - 成本：中，主要是迁移和兼容通知

### 4.2 旧插件机制

- 保留
  - 不建议
  - 原因：绑定旧前端实现，长期维护价值低
- 改造
  - `HitButtons`
  - `ReportPlugins` 中真正需要的少量扩展点
  - 适用：你明确还需要扩展能力
  - 成本：中
- 删除
  - `SearchHeaderPlugin`
  - `DownloadLinks`
  - 整套旧插件装载方式
  - 适用：你当前目标是先完成稳定替代，而不是继续做插件平台
  - 成本：低

## 5. 最推荐的下一步

如果你的目标是“尽快让新前端完全代替旧前端”，我建议顺序如下：

1. 明确旧兼容接口的保留周期
2. 暂不保留旧插件体系
3. 只把 `HitButtons` 这类真正可能有业务价值的扩展点，单独重新设计到新前端
4. 其余旧插件能力直接视为退役

## 6. 一句话判断

当前最合理的路线不是“把旧插件体系整体搬到新前端”，而是：

- 旧兼容接口先保留一段时间
- 旧插件体系整体退役
- 只把真正有价值的扩展点按新前端架构重做
