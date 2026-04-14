import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BlastAlignmentViewer } from '../components/blast-alignment-viewer'
import { BlastVisualOverview } from '../components/blast-visual-overview'
import {
  ApiClientError,
  buildApiUrl,
  buildSequenceDownloadUrl,
  cancelBlastJob,
  fetchBlastJob,
  fetchBlastJobLog,
  fetchBlastJobResult,
  fetchSequences,
  submitSequenceDownload,
} from '../lib/api'
import { formatCount, summarizeBlastResult } from '../lib/job-results'
import { buildQueryHash, parseQueryHash } from '../lib/query-navigation'
import { isBlastResultWarning } from '../lib/result-warning'
import { buildBlastResultMailto, copyText } from '../lib/share'
import type { BlastResultWarning, Job, JobLog, SequenceEntry } from '../types/api'

const QUERY_PAGE_SIZE = 8
const HIT_PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const QUERY_DETAIL_SECTION_ID = 'query-detail-panel'

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

function formatSequenceAsFasta(sequence: SequenceEntry): string {
  const charsPerLine = 60
  const defline = `>${sequence.id}${sequence.title ? ` ${sequence.title}` : ''}`
  const body = sequence.value.match(new RegExp(`.{1,${charsPerLine}}`, 'g')) || []
  return [defline, ...body].join('\n')
}

export function BlastJobDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id = '' } = useParams()
  const [job, setJob] = useState<Job | null>(null)
  const [stdoutLog, setStdoutLog] = useState<JobLog | null>(null)
  const [stderrLog, setStderrLog] = useState<JobLog | null>(null)
  const [result, setResult] = useState<unknown>(null)
  const [resultWarning, setResultWarning] = useState<BlastResultWarning | null>(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastLoadedAt, setLastLoadedAt] = useState('')
  const [queryFilter, setQueryFilter] = useState('')
  const [selectedQueryId, setSelectedQueryId] = useState('')
  const [queryPage, setQueryPage] = useState(1)
  const [hitPage, setHitPage] = useState(1)
  const [hitPageSize, setHitPageSize] = useState<number>(10)
  const [selectedHitIds, setSelectedHitIds] = useState<string[]>([])
  const [previewSequence, setPreviewSequence] = useState<SequenceEntry | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [hashQueryId, setHashQueryId] = useState(() => parseQueryHash(window.location.hash))
  const bypassLargeResultWarning = useMemo(() => {
    return new URLSearchParams(location.search).get('bypass_file_size_warning') === 'true'
  }, [location.search])

  const pollingEnabled = useMemo(
    () => autoRefresh && (job?.status === 'queued' || job?.status === 'running'),
    [autoRefresh, job?.status],
  )
  const summary = useMemo(() => summarizeBlastResult(result), [result])
  const databaseIds = useMemo(() => (job?.databases || []).map((database) => database.id), [job?.databases])
  const filteredQueries = useMemo(() => {
    if (!summary) return []

    const keyword = queryFilter.trim().toLowerCase()
    if (!keyword) return summary.queries

    return summary.queries.filter((query) => {
      return query.id.toLowerCase().includes(keyword) || query.title.toLowerCase().includes(keyword)
    })
  }, [queryFilter, summary])
  const selectedQuery = useMemo(() => {
    if (!filteredQueries.length) return null

    return (
      filteredQueries.find((query) => query.id === selectedQueryId) ||
      filteredQueries[0]
    )
  }, [filteredQueries, selectedQueryId])
  const totalQueryPages = useMemo(
    () => Math.max(1, Math.ceil(filteredQueries.length / QUERY_PAGE_SIZE)),
    [filteredQueries.length],
  )
  const visibleQueries = useMemo(() => {
    const startIndex = (queryPage - 1) * QUERY_PAGE_SIZE
    return filteredQueries.slice(startIndex, startIndex + QUERY_PAGE_SIZE)
  }, [filteredQueries, queryPage])
  const selectedQueryIndex = useMemo(
    () => filteredQueries.findIndex((query) => query.id === selectedQuery?.id),
    [filteredQueries, selectedQuery?.id],
  )
  const selectedQueryHash = useMemo(
    () => (selectedQuery ? buildQueryHash(selectedQuery.id) : ''),
    [selectedQuery],
  )
  const totalHitPages = useMemo(
    () => Math.max(1, Math.ceil((selectedQuery?.hits.length || 0) / hitPageSize)),
    [hitPageSize, selectedQuery?.hits.length],
  )
  const visibleHits = useMemo(() => {
    if (!selectedQuery) return []

    const startIndex = (hitPage - 1) * hitPageSize
    return selectedQuery.hits.slice(startIndex, startIndex + hitPageSize)
  }, [hitPage, hitPageSize, selectedQuery])

  useEffect(() => {
    setSelectedHitIds([])
    setPreviewSequence(null)
    setPreviewError('')
    setHitPage(1)
  }, [selectedQuery?.id])

  useEffect(() => {
    setQueryPage(1)
  }, [queryFilter])

  useEffect(() => {
    if (queryPage > totalQueryPages) {
      setQueryPage(totalQueryPages)
    }
  }, [queryPage, totalQueryPages])

  useEffect(() => {
    setHitPage(1)
  }, [hitPageSize, selectedQuery?.id])

  useEffect(() => {
    if (hitPage > totalHitPages) {
      setHitPage(totalHitPages)
    }
  }, [hitPage, totalHitPages])

  useEffect(() => {
    if (!filteredQueries.length) {
      setSelectedQueryId('')
      return
    }

    if (hashQueryId && filteredQueries.some((query) => query.id === hashQueryId)) {
      if (selectedQueryId !== hashQueryId) {
        setSelectedQueryId(hashQueryId)
      }
      return
    }

    if (!filteredQueries.some((query) => query.id === selectedQueryId)) {
      const fallbackQueryId = filteredQueries[0].id
      setSelectedQueryId(fallbackQueryId)
      window.history.replaceState(null, '', buildQueryHash(fallbackQueryId))
      setHashQueryId(fallbackQueryId)
    }
  }, [filteredQueries, hashQueryId, selectedQueryId])

  useEffect(() => {
    function handleHashChange() {
      setHashQueryId(parseQueryHash(window.location.hash))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  useEffect(() => {
    if (selectedQueryIndex < 0) return

    const page = Math.floor(selectedQueryIndex / QUERY_PAGE_SIZE) + 1
    if (queryPage !== page) {
      setQueryPage(page)
    }
  }, [queryPage, selectedQueryIndex])

  const loadLogs = useCallback(async () => {
    const [stdout, stderr] = await Promise.all([
      fetchBlastJobLog(id, 'stdout').catch(() => null),
      fetchBlastJobLog(id, 'stderr').catch(() => null),
    ])
    setStdoutLog(stdout)
    setStderrLog(stderr)
  }, [id])

  const loadJob = useCallback(async () => {
    setRefreshing(true)
    try {
      setError('')
      const loaded = await fetchBlastJob(id)
      setJob(loaded)
      await loadLogs()
      if (loaded.status === 'succeeded') {
        const data = await fetchBlastJobResult(id, { bypassFileSizeWarning: bypassLargeResultWarning })
        if (isBlastResultWarning(data)) {
          setResult(null)
          setResultWarning(data)
        } else {
          setResult(data)
          setResultWarning(null)
        }
      } else {
        setResult(null)
        setResultWarning(null)
      }
      setLastLoadedAt(new Date().toLocaleString('zh-CN'))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载任务详情失败')
    } finally {
      setRefreshing(false)
    }
  }, [bypassLargeResultWarning, id, loadLogs])

  usePolling(Boolean(id) && pollingEnabled, loadJob)

  useEffect(() => {
    loadJob()
  }, [id, loadJob])

  async function handleCancel() {
    try {
      const cancelled = await cancelBlastJob(id)
      setJob(cancelled)
      await loadLogs()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '取消任务失败')
    }
  }

  function toggleHitSelection(hitId: string, checked: boolean) {
    setSelectedHitIds((current) => {
      if (checked) {
        return current.includes(hitId) ? current : [...current, hitId]
      }

      return current.filter((value) => value !== hitId)
    })
  }

  function scrollToQueryDetail() {
    window.setTimeout(() => {
      document.getElementById(QUERY_DETAIL_SECTION_ID)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  function selectQuery(
    queryId: string,
    options?: {
      replaceHash?: boolean
      scrollToDetail?: boolean
    },
  ) {
    const target = filteredQueries.find((query) => query.id === queryId)
    if (!target) return

    setSelectedQueryId(queryId)
    const page = Math.floor(filteredQueries.indexOf(target) / QUERY_PAGE_SIZE) + 1
    setQueryPage(page)

    const url = buildQueryHash(queryId)
    if (options?.replaceHash) {
      window.history.replaceState(null, '', url)
    } else {
      window.history.pushState(null, '', url)
    }
    setHashQueryId(queryId)

    if (options?.scrollToDetail) {
      scrollToQueryDetail()
    }
  }

  const previousQuery = selectedQueryIndex > 0 ? filteredQueries[selectedQueryIndex - 1] : null
  const nextQuery =
    selectedQueryIndex >= 0 && selectedQueryIndex < filteredQueries.length - 1
      ? filteredQueries[selectedQueryIndex + 1]
      : null

  async function handlePreviewSequence(hitId: string) {
    if (!databaseIds.length) {
      setPreviewError('当前任务没有可用数据库标识，无法提取序列。')
      return
    }

    try {
      setPreviewLoading(true)
      setPreviewError('')
      const payload = await fetchSequences({
        sequenceIds: [hitId],
        databaseIds,
      })
      setPreviewSequence(payload.sequences[0] || null)
      if (!payload.sequences.length) {
        setPreviewError('未找到对应序列。')
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : '加载命中序列失败')
      setPreviewSequence(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  function handleDownloadSelectedHits() {
    if (!selectedHitIds.length || !databaseIds.length) return

    submitSequenceDownload({
      sequenceIds: selectedHitIds,
      databaseIds,
    })
  }

  function handleDownloadAllQueryHits() {
    if (!selectedQuery?.hits.length || !databaseIds.length) return

    submitSequenceDownload({
      sequenceIds: selectedQuery.hits.map((hit) => hit.id),
      databaseIds,
    })
  }

  const selectedHitDownloadUrl = useMemo(() => {
    if (!selectedHitIds.length || !databaseIds.length) return ''

    return buildSequenceDownloadUrl({
      sequenceIds: selectedHitIds,
      databaseIds,
    })
  }, [databaseIds, selectedHitIds])

  const statusTone =
    job?.status === 'failed' || job?.status === 'cancelled'
      ? 'status-panel status-panel-warning'
      : job?.status === 'succeeded'
        ? 'status-panel status-panel-success'
        : 'status-panel'

  const statusMessage = useMemo(() => {
    if (!job) return '正在加载任务信息。'
    if (job.status === 'queued') return '任务已进入队列，页面会按设置自动刷新。'
    if (job.status === 'running') return '任务正在运行，可查看 stdout / stderr 跟踪进度。'
    if (job.status === 'succeeded') return '任务已成功完成，结果摘要已可查看。'
    if (job.status === 'cancelled') return `任务已取消。${summarizeLog(stderrLog)}`
    if (job.status === 'failed') return `任务执行失败。${summarizeLog(stderrLog)}`
    return '任务状态未知。'
  }, [job, stderrLog])

  const shareMailtoHref = useMemo(() => {
    return buildBlastResultMailto({
      program: summary?.program || job?.method,
      queryCount: summary?.queryCount,
      databaseTitles: summary?.databaseTitles,
      url: window.location.href,
    })
  }, [hashQueryId, job?.method, summary])

  async function handleCopyLink() {
    try {
      await copyText(window.location.href)
      setShareMessage('结果链接已复制。')
      window.setTimeout(() => setShareMessage(''), 2500)
    } catch {
      setShareMessage('复制链接失败，请手动复制地址栏。')
      window.setTimeout(() => setShareMessage(''), 2500)
    }
  }

  function handleLoadLargeResultAnyway() {
    const search = new URLSearchParams(location.search)
    search.set('bypass_file_size_warning', 'true')
    navigate({
      pathname: location.pathname,
      search: `?${search.toString()}`,
      hash: location.hash,
    })
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">BLAST 任务详情</p>
        <h2>{id}</h2>
        <p className="page-copy">这一页对应单个 BLAST 任务的状态、日志、取消与结果查看。</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <article className={statusTone}>
        <div className="toolbar">
          <div className="toolbar-group">
            <strong>状态提示</strong>
            <span>{statusMessage}</span>
          </div>
          <div className="toolbar-group">
            <Link className="secondary-button action-link" to={`/blast/new?from_job=${id}`}>
              重新编辑搜索
            </Link>
            <button className="secondary-button" onClick={handleCopyLink} type="button">
              复制链接
            </button>
            <a className="secondary-button action-link" href={shareMailtoHref}>
              邮件分享
            </a>
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
        {shareMessage ? <p className="toolbar-note">{shareMessage}</p> : null}
      </article>

      <div className="two-column">
        <article className="panel">
          <h3>任务状态</h3>
          {job ? (
            <div className="detail-grid">
              <span>状态：{job.status}</span>
              <span>方法：{job.method || '-'}</span>
              <span>提交时间：{job.submitted_at}</span>
              <span>开始时间：{job.started_at || '-'}</span>
              <span>完成时间：{job.completed_at || '-'}</span>
              <span>退出码：{typeof job.exitstatus === 'number' ? job.exitstatus : '-'}</span>
              <span>数据库数量：{formatCount(job.databases?.length)}</span>
              <span>结果接口：{job.result_url || '尚未可用'}</span>
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
          {resultWarning ? (
            <div className="result-stack">
              <div className="result-box list-item-warning">
                <h4>大结果预警</h4>
                <p>{resultWarning.message}</p>
                {resultWarning.detail ? <p className="toolbar-note">{resultWarning.detail}</p> : null}
                <div className="detail-grid">
                  <span>结果大小：{formatCount(resultWarning.xml_file_size)} bytes</span>
                  <span>预警阈值：{formatCount(resultWarning.threshold)} bytes</span>
                </div>
                <div className="action-list">
                  {resultWarning.download_links.map((link) => (
                    <a
                      className="secondary-button action-link"
                      href={buildApiUrl(link.url)}
                      key={link.type}
                      rel="noreferrer"
                      target="_blank"
                    >
                      下载 {link.label}
                    </a>
                  ))}
                  <button className="primary-button" onClick={handleLoadLargeResultAnyway} type="button">
                    继续在浏览器中加载
                  </button>
                </div>
              </div>
            </div>
          ) : summary ? (
            <div className="result-stack">
              <div className="result-summary-grid">
                <div className="result-stat">
                  <span className="result-stat-label">程序</span>
                  <strong>{summary.program || '-'}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">查询数</span>
                  <strong>{formatCount(summary.queryCount)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">有命中的查询</span>
                  <strong>{formatCount(summary.queriesWithHits)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">总命中数</span>
                  <strong>{formatCount(summary.totalHits)}</strong>
                </div>
              </div>

              <div className="detail-grid">
                <span>搜索 ID：{summary.searchId || id}</span>
                <span>程序版本：{summary.programVersion || '-'}</span>
                <span>数据库：{summary.databaseTitles.length ? summary.databaseTitles.join('，') : '-'}</span>
              </div>

              {job?.downloads?.length ? (
                <div className="result-box">
                  <h4>结果导出</h4>
                  <p className="toolbar-note">导出接口已经切换到新的 API 路由，前端不再依赖旧版页面下载地址。</p>
                  <div className="action-list">
                    {job.downloads.map((download) => (
                      <a
                        className="secondary-button action-link"
                        href={buildApiUrl(download.url)}
                        key={download.type}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {download.label}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <BlastVisualOverview selectedQuery={selectedQuery} summary={summary} />

              {summary.params.length ? (
                <div className="result-box">
                  <h4>运行参数</h4>
                  <div className="key-value-grid">
                    {summary.params.slice(0, 8).map((item) => (
                      <div key={item.key} className="key-value-item">
                        <span>{item.key}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {summary.stats.length ? (
                <div className="result-box">
                  <h4>统计信息</h4>
                  <div className="key-value-grid">
                    {summary.stats.map((item) => (
                      <div key={item.key} className="key-value-item">
                        <span>{item.key}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="result-box">
                <h4>查询摘要</h4>
                <label className="filter-field">
                  <span>筛选 query</span>
                  <input
                    value={queryFilter}
                    onChange={(event) => setQueryFilter(event.target.value)}
                    placeholder="输入 query ID 或标题"
                  />
                </label>
                <div className="pagination-bar">
                  <span className="toolbar-note">
                    共 {formatCount(filteredQueries.length)} 个 query，当前第 {formatCount(queryPage)} / {formatCount(totalQueryPages)} 页。
                  </span>
                  <div className="toolbar-group">
                    <button
                      className="secondary-button"
                      disabled={queryPage <= 1}
                      onClick={() => setQueryPage((current) => Math.max(1, current - 1))}
                      type="button"
                    >
                      上一页
                    </button>
                    <button
                      className="secondary-button"
                      disabled={queryPage >= totalQueryPages}
                      onClick={() => setQueryPage((current) => Math.min(totalQueryPages, current + 1))}
                      type="button"
                    >
                      下一页
                    </button>
                  </div>
                </div>
                <p className="toolbar-note">
                  结果页已支持 query 锚点链接。当前选中的 query 会同步到地址栏 hash，刷新或分享链接后可直接定位。
                </p>
                <div className="list">
                  {visibleQueries.map((query) => (
                    <button
                      className={query.id === selectedQuery?.id ? 'list-item query-item query-item-active' : 'list-item query-item'}
                      key={query.id}
                      onClick={() => selectQuery(query.id, { scrollToDetail: true })}
                      type="button"
                    >
                      <strong>{query.id}</strong>
                      <span>标题：{query.title || '-'}</span>
                      <span>序号：{formatCount(query.number)}</span>
                      <span>长度：{formatCount(query.length)}</span>
                      <span>命中数：{formatCount(query.hitCount)}</span>
                      {query.topHit ? (
                        <span>
                          Top hit：{query.topHit.id}
                          {query.topHit.title ? ` / ${query.topHit.title}` : ''}
                          {typeof query.topHit.totalScore === 'number' ? ` / score ${query.topHit.totalScore}` : ''}
                          {typeof query.topHit.qcovs === 'number' ? ` / qcov ${query.topHit.qcovs}%` : ''}
                        </span>
                      ) : (
                        <span>Top hit：无命中</span>
                      )}
                    </button>
                  ))}
                  {!filteredQueries.length ? <p>没有匹配的 query。</p> : null}
                </div>
              </div>

              {selectedQuery ? (
                <div className="result-box" id={QUERY_DETAIL_SECTION_ID}>
                  <h4>Query 详细浏览</h4>
                  <div className="pagination-bar">
                    <span className="toolbar-note">
                      当前 query：{formatCount(selectedQueryIndex + 1)} / {formatCount(filteredQueries.length)}
                      {selectedQueryHash ? `，锚点 ${selectedQueryHash}` : ''}
                    </span>
                    <div className="toolbar-group">
                      <button
                        className="secondary-button"
                        disabled={!previousQuery}
                        onClick={() => previousQuery && selectQuery(previousQuery.id, { scrollToDetail: true })}
                        type="button"
                      >
                        上一个 Query
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!nextQuery}
                        onClick={() => nextQuery && selectQuery(nextQuery.id, { scrollToDetail: true })}
                        type="button"
                      >
                        下一个 Query
                      </button>
                    </div>
                  </div>
                  <div className="detail-grid">
                    <span>ID：{selectedQuery.id}</span>
                    <span>标题：{selectedQuery.title || '-'}</span>
                    <span>序号：{formatCount(selectedQuery.number)}</span>
                    <span>长度：{formatCount(selectedQuery.length)}</span>
                    <span>命中数：{formatCount(selectedQuery.hitCount)}</span>
                  </div>

                  <div className="result-box">
                    <h4>命中序列操作</h4>
                    <p className="toolbar-note">
                      当前 query 共 {formatCount(selectedQuery.hitCount)} 个命中，当前第 {formatCount(hitPage)} / {formatCount(totalHitPages)} 页。
                    </p>
                    <div className="pagination-bar">
                      <div className="toolbar-group">
                        {HIT_PAGE_SIZE_OPTIONS.map((size) => (
                          <button
                            className={hitPageSize === size ? 'secondary-button active' : 'secondary-button'}
                            key={size}
                            onClick={() => setHitPageSize(size)}
                            type="button"
                          >
                            每页 {size}
                          </button>
                        ))}
                      </div>
                      <div className="toolbar-group">
                        <button
                          className="secondary-button"
                          disabled={hitPage <= 1}
                          onClick={() => setHitPage((current) => Math.max(1, current - 1))}
                          type="button"
                        >
                          上一页
                        </button>
                        <button
                          className="secondary-button"
                          disabled={hitPage >= totalHitPages}
                          onClick={() => setHitPage((current) => Math.min(totalHitPages, current + 1))}
                          type="button"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                    <div className="action-list">
                      <button
                        className="secondary-button"
                        disabled={!selectedHitIds.length || !databaseIds.length}
                        onClick={handleDownloadSelectedHits}
                        type="button"
                      >
                        下载已选 hits FASTA
                      </button>
                      <button
                        className="secondary-button"
                        disabled={!selectedQuery.hits.length || !databaseIds.length}
                        onClick={handleDownloadAllQueryHits}
                        type="button"
                      >
                        下载当前 query 全部命中 FASTA
                      </button>
                    </div>
                    <p className="toolbar-note">
                      已选择 {formatCount(selectedHitIds.length)} 个 hit。
                      {selectedHitDownloadUrl ? ` 也可直接通过 ${selectedHitDownloadUrl} 发起 GET 下载。` : ''}
                    </p>
                    {previewLoading ? <p>命中序列加载中...</p> : null}
                    {previewError ? <p className="error-text">{previewError}</p> : null}
                    {previewSequence ? (
                      <div className="sequence-preview">
                        <div className="toolbar">
                          <div className="toolbar-group">
                            <strong>{previewSequence.id}</strong>
                            <span>{previewSequence.title || '-'}</span>
                          </div>
                          <div className="toolbar-group">
                            <span>长度：{formatCount(previewSequence.length)}</span>
                          </div>
                        </div>
                        <pre className="sequence-box">{formatSequenceAsFasta(previewSequence)}</pre>
                      </div>
                    ) : null}
                  </div>

                  <div className="list">
                    {visibleHits.map((hit) => {
                      const firstHsp = hit.hsps[0]
                      const checked = selectedHitIds.includes(hit.id)

                      return (
                        <div className="subresult-card" key={`${selectedQuery.id}-${hit.id}`}>
                          <div className="subresult-card-header">
                            <div className="subresult-card-title">
                              <strong>{hit.id}</strong>
                            </div>
                            <div className="subresult-card-actions">
                              <label className="inline-toggle">
                                <input
                                  checked={checked}
                                  onChange={(event) => toggleHitSelection(hit.id, event.target.checked)}
                                  type="checkbox"
                                />
                                <span>选中</span>
                              </label>
                              <button
                                className={previewSequence?.id === hit.id ? 'secondary-button active' : 'secondary-button'}
                                onClick={() => handlePreviewSequence(hit.id)}
                                type="button"
                              >
                                查看序列
                              </button>
                            </div>
                          </div>
                          <span>标题：{hit.title || '-'}</span>
                          <span>长度：{formatCount(hit.length)}</span>
                          <span>总分：{typeof hit.totalScore === 'number' ? hit.totalScore : '-'}</span>
                          <span>Query coverage：{typeof hit.qcovs === 'number' ? `${hit.qcovs}%` : '-'}</span>
                          <span>物种：{hit.sciname || '-'}</span>
                          {firstHsp ? (
                            <div className="key-value-grid">
                              <div className="key-value-item">
                                <span>evalue</span>
                                <strong>{firstHsp.evalue ?? '-'}</strong>
                              </div>
                              <div className="key-value-item">
                                <span>bit score</span>
                                <strong>{firstHsp.bitScore ?? '-'}</strong>
                              </div>
                              <div className="key-value-item">
                                <span>identity</span>
                                <strong>{firstHsp.identity ?? '-'}</strong>
                              </div>
                              <div className="key-value-item">
                                <span>alignment length</span>
                                <strong>{firstHsp.length ?? '-'}</strong>
                              </div>
                              <div className="key-value-item">
                                <span>qcovhsp</span>
                                <strong>{typeof firstHsp.qcovhsp === 'number' ? `${firstHsp.qcovhsp}%` : '-'}</strong>
                              </div>
                              <div className="key-value-item">
                                <span>query range</span>
                                <strong>{firstHsp.qstart ?? '-'} - {firstHsp.qend ?? '-'}</strong>
                              </div>
                              <div className="key-value-item">
                                <span>subject range</span>
                                <strong>{firstHsp.sstart ?? '-'} - {firstHsp.send ?? '-'}</strong>
                              </div>
                            </div>
                          ) : (
                            <span>首个 HSP：无</span>
                          )}
                          <BlastAlignmentViewer
                            algorithm={summary.program || job?.method || 'blastn'}
                            hit={hit}
                            queryId={selectedQuery.id}
                            queryLength={selectedQuery.length}
                          />
                        </div>
                      )
                    })}
                    {!selectedQuery.hits.length ? <p>该 query 没有命中结果。</p> : null}
                  </div>
                </div>
              ) : null}

              <details className="raw-result">
                <summary>查看原始结果 JSON</summary>
                <pre className="log-box">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          ) : (
            <p>任务未完成或结果尚未加载。</p>
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
