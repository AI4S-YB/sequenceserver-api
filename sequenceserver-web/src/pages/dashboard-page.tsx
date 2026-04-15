import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchBlastJobs, fetchDatabaseJobs, fetchDatabases } from '../lib/api'
import { useI18n } from '../lib/i18n'
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
  const { t } = useI18n()

  return (
    <article className="panel">
      <h3>{title}</h3>
      <div className="list">
        {jobs.map((job) => (
          <div className="list-item" key={job.id}>
            <strong>
              <Link to={job.kind === 'blast' ? `/jobs/blast/${job.id}` : `/jobs/database/${job.id}`}>{job.id}</Link>
            </strong>
            <span>{t('common.status')}：{job.status}</span>
            {job.title ? <span>{t('common.title')}：{job.title}</span> : null}
            {job.method ? <span>{t('common.method')}：{job.method}</span> : null}
          </div>
        ))}
        {!jobs.length ? <p>{t('common.noData')}</p> : null}
      </div>
    </article>
  )
}

function RecentDatabases({ databases }: { databases: Database[] }) {
  const { t } = useI18n()

  return (
    <article className="panel">
      <h3>{t('dashboard.databaseOverview')}</h3>
      <div className="list">
        {databases.slice(0, 6).map((database) => (
          <div className="list-item" key={database.id}>
            <strong>{database.title}</strong>
            <span>{t('common.type')}：{database.type}</span>
            <code>{database.name}</code>
          </div>
        ))}
      </div>
    </article>
  )
}

export function DashboardPage() {
  const { t } = useI18n()
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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load overview data'))
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
        <p className="eyebrow">{t('dashboard.eyebrow')}</p>
        <h2>{t('dashboard.title')}</h2>
        <p className="page-copy">{t('dashboard.copy')}</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="card-grid">
        <MetricCard label={t('dashboard.metric.databases')} value={metrics.databases} helper={t('dashboard.metric.databasesHelper')} />
        <MetricCard label={t('dashboard.metric.running')} value={metrics.running} helper={t('dashboard.metric.runningHelper')} />
        <MetricCard label={t('dashboard.metric.queued')} value={metrics.queued} helper={t('dashboard.metric.queuedHelper')} />
        <MetricCard label={t('dashboard.metric.failed')} value={metrics.failed} helper={t('dashboard.metric.failedHelper')} />
      </div>

      <div className="two-column">
        <RecentDatabases databases={databases} />
        <article className="panel">
          <h3>{t('dashboard.quickLinks')}</h3>
          <div className="list">
            <div className="list-item">
              <strong><Link to="/databases">{t('dashboard.openDatabases')}</Link></strong>
              <span>{t('dashboard.openDatabasesHelper')}</span>
            </div>
            <div className="list-item">
              <strong><Link to="/blast/new">{t('dashboard.openBlast')}</Link></strong>
              <span>{t('dashboard.openBlastHelper')}</span>
            </div>
            <div className="list-item">
              <strong><Link to="/jobs">{t('dashboard.openJobs')}</Link></strong>
              <span>{t('dashboard.openJobsHelper')}</span>
            </div>
          </div>
        </article>
      </div>

      <div className="two-column">
        <RecentJobs title={t('dashboard.recentBlastJobs')} jobs={blastJobs} />
        <RecentJobs title={t('dashboard.recentDatabaseJobs')} jobs={databaseJobs} />
      </div>
    </section>
  )
}
