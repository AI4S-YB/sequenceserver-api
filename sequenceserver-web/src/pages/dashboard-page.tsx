import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlastJobs, fetchDatabaseJobs, fetchDatabases } from '../lib/api'
import type { Database, Job } from '../types/api'

function MetricCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <article className="card">
      <p className="metric-label">{label}</p>
      <strong className="metric-value">{value}</strong>
      <p className="metric-helper">{helper}</p>
    </article>
  )
}

function RecentJobs({ title, jobs }: { title: string; jobs: Job[] }) {
  return (
    <article className="panel">
      <h3>{title}</h3>
      <div className="list">
        {jobs.map((job) => (
          <div className="list-item" key={job.id}>
            <strong>
              <Link to={job.kind === 'blast' ? `/jobs/blast/${job.id}` : `/jobs/database/${job.id}`}>{job.id}</Link>
            </strong>
            <span>状态：{job.status}</span>
            {job.title ? <span>标题：{job.title}</span> : null}
            {job.method ? <span>方法：{job.method}</span> : null}
          </div>
        ))}
        {!jobs.length ? <p>暂无数据。</p> : null}
      </div>
    </article>
  )
}

function RecentDatabases({ databases }: { databases: Database[] }) {
  return (
    <article className="panel">
      <h3>数据库概览</h3>
      <div className="list">
        {databases.slice(0, 6).map((database) => (
          <div className="list-item" key={database.id}>
            <strong>{database.title}</strong>
            <span>类型：{database.type}</span>
            <code>{database.name}</code>
          </div>
        ))}
      </div>
    </article>
  )
}

export function DashboardPage() {
  const [databases, setDatabases] = useState<Database[]>([])
  const [blastJobs, setBlastJobs] = useState<Job[]>([])
  const [databaseJobs, setDatabaseJobs] = useState<Job[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([fetchDatabases(), fetchBlastJobs({ limit: 5 }), fetchDatabaseJobs({ limit: 5 })])
      .then(([databaseList, blastList, indexList]) => {
        setDatabases(databaseList)
        setBlastJobs(blastList)
        setDatabaseJobs(indexList)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载首页数据失败'))
  }, [])

  const metrics = useMemo(() => {
    const allJobs = [...blastJobs, ...databaseJobs]
    return {
      databases: databases.length,
      running: allJobs.filter((job) => job.status === 'running').length,
      queued: allJobs.filter((job) => job.status === 'queued').length,
      failed: allJobs.filter((job) => job.status === 'failed').length,
    }
  }, [blastJobs, databaseJobs, databases.length])

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">系统总览</p>
        <h2>前后端分离首页仪表盘</h2>
        <p className="page-copy">
          这里已经开始使用真实 API 数据，显示数据库数量、最近任务与系统状态。
        </p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="card-grid">
        <MetricCard label="数据库数量" value={metrics.databases} helper="当前已加载数据库数" />
        <MetricCard label="运行中任务" value={metrics.running} helper="BLAST 与索引任务合计" />
        <MetricCard label="排队中任务" value={metrics.queued} helper="等待执行的任务" />
        <MetricCard label="失败任务" value={metrics.failed} helper="需要人工检查的任务" />
      </div>

      <div className="two-column">
        <RecentDatabases databases={databases} />
        <article className="panel">
          <h3>快捷入口</h3>
          <div className="list">
            <div className="list-item">
              <strong><Link to="/databases">进入数据库管理</Link></strong>
              <span>导入 FASTA、路径、URL 或 S3。</span>
            </div>
            <div className="list-item">
              <strong><Link to="/blast/new">进入 BLAST 提交</Link></strong>
              <span>创建新的 BLAST 任务。</span>
            </div>
            <div className="list-item">
              <strong><Link to="/jobs">进入任务中心</Link></strong>
              <span>查看近期任务、状态与日志。</span>
            </div>
          </div>
        </article>
      </div>

      <div className="two-column">
        <RecentJobs title="最近 BLAST 任务" jobs={blastJobs} />
        <RecentJobs title="最近数据库索引任务" jobs={databaseJobs} />
      </div>
    </section>
  )
}
