# 外部导入安全配置说明

当前系统对外部数据库导入采用“默认拒绝”的策略。

也就是说：

- 直接提交序列文本 `sequence`：允许
- 前端通过 `multipart/form-data` 上传文件：允许
- 通过 `local_path` 导入本机文件：默认禁止
- 通过 `url` 导入远程文件：默认禁止
- 通过 `s3://bucket/key` 导入对象存储文件：默认禁止

只有在配置文件中显式加入白名单后，相关外部导入方式才会被允许。

## 配置文件位置

默认配置文件为：

```yaml
~/.sequenceserver.conf
```

## 可用配置项

你可以在配置文件中加入以下字段：

```yaml
allowed_import_paths:
  - /data/blast-imports
  - /mnt/genomes

allowed_import_urls:
  - https://example-bucket.s3.amazonaws.com/
  - https://s3.ap-southeast-1.amazonaws.com/my-bucket/

allowed_s3_buckets:
  - my-bucket
  - omics-data-prod
```

## 各配置项含义

### `allowed_import_paths`

允许通过 `local_path` 方式导入的本机目录白名单。

只有当传入路径位于这些目录之内时，后端才会允许读取该文件。

例如：

- 允许目录：`/data/blast-imports`
- 可通过：`/data/blast-imports/demo.fa`
- 不可通过：`/tmp/demo.fa`

### `allowed_import_urls`

允许通过 `url` 或带 `https://...` 的远程导入地址白名单。

规则是“前缀匹配”，也就是传入的 URL 必须以白名单中的某个前缀开头。

例如：

- 白名单：`https://example-bucket.s3.amazonaws.com/`
- 可通过：`https://example-bucket.s3.amazonaws.com/test/demo.fa`
- 不可通过：`https://other-site.example.com/demo.fa`

### `allowed_s3_buckets`

允许通过 `s3://bucket/key` 方式导入的 S3 bucket 白名单。

例如：

- 白名单：`my-bucket`
- 可通过：`s3://my-bucket/demo.fa`
- 不可通过：`s3://other-bucket/demo.fa`

## 当前阶段如何使用

如果你现在还没有确定：

- 本机可访问目录在哪里
- S3 bucket 在哪里
- 未来会接哪个对象存储地址

也没有关系。

你可以先保持以下默认状态：

```yaml
allowed_import_paths: []
allowed_import_urls: []
allowed_s3_buckets: []
```

这表示：

- 系统仍然允许前端上传文件
- 系统仍然允许直接提交序列内容
- 系统不会允许任意读取本机路径
- 系统不会允许任意访问远程 URL 或 S3

这样是最安全的初始部署方式。

等以后你明确了实际资源位置，再把对应目录、URL 前缀或 bucket 名字加进去即可，无需改代码。

## 建议

在生产环境中，建议遵循以下原则：

- `allowed_import_paths` 只配置专门的数据导入目录，不要直接开放整个磁盘路径
- `allowed_import_urls` 只配置可信的对象存储前缀或预签名 URL 域名
- `allowed_s3_buckets` 只配置业务实际使用的 bucket
- 不要为了图方便把白名单配置得过大

## 说明

本说明对应当前已经实现的后端接口能力，相关安全校验已经在代码中启用。
