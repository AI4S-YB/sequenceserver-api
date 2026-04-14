import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiClientError, cancelDatabaseJob, fetchDatabaseJob, fetchDatabaseJobLog, fetchDatabaseJobResult } from '../lib/api'
import { formatCount, summarizeDatabaseResult } from '../lib/job-results'
import type { Job, JobLog } from '../types/api'

function usePolling(enabled: boolean, callback: () => void) {
  useEffect(() => {
    if (!enabled) return

    callback()
    const timer = window.setInterval(callback, 3000)
    return () => window.clearInterval(timer)
  }, [enabled, callback])
}

function summarizeLog(log?: JobLog | null): string {
  if (!log?.content) return '暂无日志摘要。'

  const lines = log.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.slice(-3).join(' | ') || '暂无日志摘要。'
}

export function DatabaseJobDetailPage() {
  const { id = '' } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [stdoutLog, setStdoutLog] = useState<JobLog | null>(null)
  const [stderrLog, setStderrLog] = useState<JobLog | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastLoadedAt, setLastLoadedAt] = useState('')

  const pollingEnabled = useMemo(
    () => autoRefresh && (job?.status === 'queued' || job?.status === 'running'),
    [autoRefresh, job?.status],
  )
  const summary = useMemo(() => summarizeDatabaseResult(result), [result])

  const loadLogs = useCallback(async () => {
    const [stdout, stderr] = await Promise.all([
      fetchDatabaseJobLog(id, 'stdout').catch(() => null),
      fetchDatabaseJobLog(id, 'stderr').catch(() => null),
    ])
    setStdoutLog(stdout)
    setStderrLog(stderr)
  }, [id])

  const loadJob = useCallback(async () => {
    setRefreshing(true)
    try {
      setError('')
      const loaded = await fetchDatabaseJob(id)
      setJob(loaded)
      await loadLogs()
      if (loaded.status === 'succeeded') {
        const data = await fetchDatabaseJobResult(id)
        setResult(data)
      } else {
        setResult(null)
      }
      setLastLoadedAt(new Date().toLocaleString('zh-CN'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务详情失败')
    } finally {
      setRefreshing(false)
    }
  }, [id, loadLogs])

  usePolling(Boolean(id) && pollingEnabled, loadJob)

  useEffect(() => {
    loadJob()
  }, [id, loadJob])

  async function handleCancel() {
    try {
      const cancelled = await cancelDatabaseJob(id)
      setJob(cancelled)
      await loadLogs()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '取消任务失败')
    }
  }

  const statusTone =
    job?.status === 'failed' || job?.status === 'cancelled'
      ? 'status-panel status-panel-warning'
      : job?.status === 'succeeded'
        ? 'status-panel status-panel-success'
        : 'status-panel'

  const statusMessage = useMemo(() => {
    if (!job) return '正在加载任务信息。'
    if (job.status === 'queued') return '索引任务已进入队列，页面会按设置自动刷新。'
    if (job.status === 'running') return '索引任务正在运行，可通过日志观察 makeblastdb 执行进度。'
    if (job.status === 'succeeded') return '索引任务已成功完成，数据库元数据已可查看。'
    if (job.status === 'cancelled') return `索引任务已取消。${summarizeLog(stderrLog)}`
    if (job.status === 'failed') return `索引任务执行失败。${summarizeLog(stderrLog)}`
    return '任务状态未知。'
  }, [job, stderrLog])

  const failureHints = useMemo(() => {
    if (!job || (job.status !== 'failed' && job.status !== 'cancelled')) return []

    const stderr = stderrLog?.content || ''
    const stdout = stdoutLog?.content || ''
    const combined = `${stderr}\n${stdout}`.toLowerCase()
    const hints: string[] = []

    if (combined.includes('permission denied')) {
      hints.push('检测到权限不足，优先检查数据库目录和输出目录的写权限。')
    }
    if (combined.includes('no space left') || combined.includes('not enough disk space')) {
      hints.push('检测到磁盘空间不足，需要先清理目标磁盘后再重试。')
    }
    if (combined.includes('taxid') || combined.includes('taxonomy')) {
      hints.push('日志里出现 taxid/taxonomy 相关信息，建议核对 taxid 参数和本地 taxonomy 数据。')
    }
    if (combined.includes('invalid') && combined.includes('fasta')) {
      hints.push('日志里出现 FASTA 格式异常，建议检查序列头和文件编码。')
    }
    if (job.status === 'cancelled') {
      hints.push('该任务是人工取消，不一定代表数据库文件本身有问题。')
    }

    return hints
  }, [job, stderrLog?.content, stdoutLog?.content])

  const nextActions = useMemo(() => {
    if (!job) return []

    if (job.status === 'succeeded') {
      return [
        { label: '返回数据库管理', to: '/databases', helper: '查看新索引数据库是否已出现在列表中。' },
        { label: '去提交 BLAST', to: '/blast/new', helper: '基于新数据库直接发起一次检索。' },
        { label: '返回任务中心', to: '/jobs', helper: '继续查看其他任务状态。' },
      ]
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      return [
        { label: '返回数据库管理', to: '/databases', helper: '检查原始 FASTA、路径和导入方式。' },
        { label: '返回任务中心', to: '/jobs', helper: '切回任务列表继续排查其他任务。' },
      ]
    }

    return [{ label: '返回任务中心', to: '/jobs', helper: '查看队列里的其他任务。' }]
  }, [job])

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">数据库索引任务详情</p>
        <h2>{id}</h2>
        <p className="page-copy">这一页对应单个数据库索引任务的状态、日志、取消与结果查看。</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <article className={statusTone}>
        <div className="toolbar">
          <div className="toolbar-group">
            <strong>状态提示</strong>
            <span>{statusMessage}</span>
          </div>
          <div className="toolbar-group">
            <label className="inline-toggle">
              <input
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                type="checkbox"
              />
              <span>自动刷新</span>
            </label>
            <button className="secondary-button" disabled={refreshing} onClick={loadJob} type="button">
              {refreshing ? '刷新中...' : '立即刷新'}
            </button>
          </div>
        </div>
        <p className="toolbar-note">
          最近刷新时间：{lastLoadedAt || '尚未完成首次加载'}
          {autoRefresh ? '，运行中任务会每 3 秒自动刷新。' : '，当前为手动刷新模式。'}
        </p>
      </article>

      <div className="two-column">
        <article className="panel">
          <h3>任务状态</h3>
          {job ? (
            <div className="detail-grid">
              <span>状态：{job.status}</span>
              <span>数据库 ID：{job.database_id || '-'}</span>
              <span>标题：{job.title || '-'}</span>
              <span>提交时间：{job.submitted_at}</span>
              <span>开始时间：{job.started_at || '-'}</span>
              <span>完成时间：{job.completed_at || '-'}</span>
              <span>退出码：{typeof job.exitstatus === 'number' ? job.exitstatus : '-'}</span>
              {(job.status === 'queued' || job.status === 'running') ? (
                <button className="primary-button" type="button" onClick={handleCancel}>
                  取消任务
                </button>
              ) : null}
            </div>
          ) : (
            <p>加载中...</p>
          )}
        </article>

        <article className="panel">
          <h3>结果概览</h3>
          {summary ? (
            <div className="result-stack">
              <div className="result-summary-grid">
                <div className="result-stat">
                  <span className="result-stat-label">索引状态</span>
                  <strong>{summary.indexed ? '已完成' : '未完成'}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">序列数</span>
                  <strong>{formatCount(summary.nsequences)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">字符数</span>
                  <strong>{formatCount(summary.ncharacters)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">数据库类型</span>
                  <strong>{summary.type || '-'}</strong>
                </div>
              </div>

              <div className="detail-grid">
                <span>数据库 ID：{summary.id || job?.database_id || '-'}</span>
                <span>名称：{summary.name || '-'}</span>
                <span>标题：{summary.title || job?.title || '-'}</span>
                <span>更新时间：{summary.updatedOn || '-'}</span>
                <span>格式版本：{summary.format || '-'}</span>
                <span>分类：{summary.categories.length ? summary.categories.join('，') : '-'}</span>
              </div>

              <div className="result-box">
                <h4>后续操作</h4>
                <div className="list">
                  {nextActions.map((action) => (
                    <div className="list-item" key={action.to}>
                      <strong>
                        <Link to={action.to}>{action.label}</Link>
                      </strong>
                      <span>{action.helper}</span>
                    </div>
                  ))}
                </div>
              </div>

              <details className="raw-result">
                <summary>查看原始结果 JSON</summary>
                <pre className="log-box">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          ) : (
            <div className="result-stack">
              <p>任务未完成或结果尚未加载。</p>
              {job?.result_url ? <code>{job.result_url}</code> : null}
              {(job?.status === 'failed' || job?.status === 'cancelled') && failureHints.length ? (
                <div className="result-box">
                  <h4>失败诊断建议</h4>
                  <div className="list">
                    {failureHints.map((hint) => (
                      <div className="list-item list-item-warning" key={hint}>
                        <span>{hint}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="result-box">
                <h4>后续操作</h4>
                <div className="list">
                  {nextActions.map((action) => (
                    <div className="list-item" key={action.to}>
                      <strong>
                        <Link to={action.to}>{action.label}</Link>
                      </strong>
                      <span>{action.helper}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </article>
      </div>

      <div className="two-column">
        <article className="panel">
          <h3>stdout</h3>
          <p className="toolbar-note">摘要：{summarizeLog(stdoutLog)}</p>
          <pre className="log-box">{stdoutLog?.content || '暂无输出'}</pre>
        </article>
        <article className="panel">
          <h3>stderr</h3>
          <p className="toolbar-note">摘要：{summarizeLog(stderrLog)}</p>
          <pre className="log-box">{stderrLog?.content || '暂无输出'}</pre>
        </article>
      </div>
    </section>
  )
}
