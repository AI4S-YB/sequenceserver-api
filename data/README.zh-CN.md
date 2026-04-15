# 项目内置示例数据

这个目录用于存放当前项目默认附带的 BLAST 示例数据与搜索示例序列。

目录说明：

- `blast-db/`
  - 提供项目启动后即可直接使用的 BLAST 数据库
  - 当前内置：
    - `transcripts/Arabidopsis_thaliana/Arabidopsis_thaliana.mRNA.fasta`
    - `proteins/Arabidopsis_thaliana/Arabidopsis_thaliana.protein.fasta`
- `examples/blast-query/`
  - 提供新前端 BLAST 搜索页默认示例序列
  - 当前内置：
    - `arabidopsis_mrna.fa`
    - `arabidopsis_protein.fa`

当前设计目标：

- 用户启动程序后，无需额外导入数据库即可直接测试
- 搜索页可根据 BLAST 方法自动切换核酸或蛋白示例

如果后续要替换成你自己的默认数据库：

1. 替换 `blast-db/` 中的 FASTA 及其 BLAST 索引文件
2. 替换 `examples/blast-query/` 中的示例 FASTA
3. 保持 [`config/sequenceserver.local.conf`](/Users/kentnf/projects/omicsagent/sequenceserver/config/sequenceserver.local.conf) 指向新的数据库目录
