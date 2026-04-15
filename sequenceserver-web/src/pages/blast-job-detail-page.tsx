import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { buildAlignmentExport, type BlastAlgorithm } from '../lib/blast-alignment'
import { BlastAlignmentViewer } from '../components/blast-alignment-viewer'
import { BlastQueryOverview } from '../components/blast-query-overview'
import { CollapsibleSection } from '../components/collapsible-section'
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
import { appConfig } from '../lib/config'
import { useI18n } from '../lib/i18n'
import { formatCount, summarizeBlastResult } from '../lib/job-results'
import { resolveHitActions } from '../lib/hit-actions'
import { buildQueryHash, parseQueryHash } from '../lib/query-navigation'
import { isBlastResultWarning } from '../lib/result-warning'
import { buildBlastResultMailto, copyText } from '../lib/share'
import type { BlastResultWarning, Job, JobLog, SequenceEntry } from '../types/api'

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

function summarizeLog(log?: JobLog | null, isChinese = true): string {
  if (!log?.content) return isChinese ? '暂无日志摘要。' : 'No log summary.'

  const lines = log.content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.slice(-3).join(' | ') || (isChinese ? '暂无日志摘要。' : 'No log summary.')
}

function formatSequenceAsFasta(sequence: SequenceEntry): string {
  const charsPerLine = 60
  const defline = `>${sequence.id}${sequence.title ? ` ${sequence.title}` : ''}`
  const body = sequence.value.match(new RegExp(`.{1,${charsPerLine}}`, 'g')) || []
  return [defline, ...body].join('\n')
}

function downloadTextFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function hitCardId(queryId: string, hitId: string): string {
  return `hit-card-${sanitizeFilename(queryId)}-${sanitizeFilename(hitId)}`
}

function formatEvalueDisplay(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value === 0) return '0'
  if (value >= 0.01 && value < 1000) return Number.isInteger(value) ? String(value) : value.toFixed(2)
  return value.toExponential(2)
}

function formatIdentityPercent(identity?: number, length?: number): string {
  if (typeof identity !== 'number' || typeof length !== 'number' || length <= 0) return '-'
  return `${((identity / length) * 100).toFixed(1)}%`
}

function findSummaryValue(
  items: Array<{ key: string; value: string }> | undefined,
  expectedKeys: string[],
): string | undefined {
  if (!items?.length) return undefined

  const lowered = expectedKeys.map((item) => item.toLowerCase())
  return items.find((item) => lowered.includes(item.key.toLowerCase()))?.value
}

export function BlastJobDetailPage() {
  const { t, isChinese, locale } = useI18n()
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
      setLastLoadedAt(new Date().toLocaleString(isChinese ? 'zh-CN' : 'en-US'))
    } catch (err) {
      setError(err instanceof Error ? err.message : isChinese ? '加载任务详情失败' : 'Failed to load job details')
    } finally {
      setRefreshing(false)
    }
  }, [bypassLargeResultWarning, id, isChinese, loadLogs])

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
      setError(err instanceof ApiClientError ? err.message : isChinese ? '取消任务失败' : 'Failed to cancel job')
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
      setPreviewError(isChinese ? '当前任务没有可用数据库标识，无法提取序列。' : 'No database identifiers are available for sequence lookup.')
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
        setPreviewError(isChinese ? '未找到对应序列。' : 'Sequence not found.')
      }
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : isChinese ? '加载命中序列失败' : 'Failed to load matched sequence')
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

  function handleDownloadSelectedHitsAlignment() {
    if (!selectedQuery || !selectedHitIds.length) return

    const selectedHits = selectedQuery.hits.filter((hit) => selectedHitIds.includes(hit.id))
    if (!selectedHits.length) return

    const content = selectedHits
      .map((hit) => buildAlignmentExport(selectedQuery.id, hit.id, hit.hsps, queryAlgorithm, 90, locale))
      .join('\n\n')

    downloadTextFile(content, `${sanitizeFilename(selectedQuery.id)}__selected_hits_alignment.txt`)
  }

  function focusHitCard(targetHitId: string) {
    if (!selectedQuery) return

    const hitIndex = selectedQuery.hits.findIndex((hit) => hit.id === targetHitId)
    if (hitIndex < 0) return

    const nextPage = Math.floor(hitIndex / hitPageSize) + 1
    if (nextPage !== hitPage) {
      setHitPage(nextPage)
    }

    window.setTimeout(() => {
      document.getElementById(hitCardId(selectedQuery.id, targetHitId))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 40)
  }

  const selectedHitDownloadUrl = useMemo(() => {
    if (!selectedHitIds.length || !databaseIds.length) return ''

    return buildSequenceDownloadUrl({
      sequenceIds: selectedHitIds,
      databaseIds,
    })
  }, [databaseIds, selectedHitIds])
  const resultApiUrl = useMemo(() => (job?.result_url ? buildApiUrl(job.result_url) : ''), [job?.result_url])
  const stdoutApiUrl = useMemo(() => (job?.log_urls?.stdout ? buildApiUrl(job.log_urls.stdout) : ''), [job?.log_urls?.stdout])
  const stderrApiUrl = useMemo(() => (job?.log_urls?.stderr ? buildApiUrl(job.log_urls.stderr) : ''), [job?.log_urls?.stderr])
  const selectedQueryHasSpecies = useMemo(
    () => Boolean(selectedQuery?.hits.some((hit) => Boolean(hit.sciname))),
    [selectedQuery],
  )
  const queryAlgorithm = useMemo<BlastAlgorithm>(
    () => (summary?.program || job?.method || 'blastn') as BlastAlgorithm,
    [job?.method, summary?.program],
  )
  const reportProgram = useMemo(
    () => (summary?.program || job?.method || 'BLAST').toUpperCase(),
    [job?.method, summary?.program],
  )
  const reportSummaryLabel = useMemo(() => {
    const queryCount = summary?.queryCount ?? 0
    const databaseCount = summary?.databaseTitles.length ?? job?.databases?.length ?? 0
    return `${reportProgram}: ${formatCount(queryCount)} ${queryCount === 1 ? 'query' : 'queries'}, ${formatCount(databaseCount)} ${databaseCount === 1 ? 'database' : 'databases'}`
  }, [job?.databases?.length, reportProgram, summary?.databaseTitles.length, summary?.queryCount])
  const sequenceCountLabel = useMemo(
    () => findSummaryValue(summary?.stats, ['nsequences', 'num_sequences']),
    [summary?.stats],
  )
  const characterCountLabel = useMemo(
    () => findSummaryValue(summary?.stats, ['ncharacters', 'num_characters']),
    [summary?.stats],
  )
  const hasGraphicalOverview = useMemo(() => Boolean(summary && summary.totalHits > 1), [summary])

  const statusTone =
    job?.status === 'failed' || job?.status === 'cancelled'
      ? 'status-panel status-panel-warning'
      : job?.status === 'succeeded'
        ? 'status-panel status-panel-success'
        : 'status-panel'

  const statusMessage = useMemo(() => {
    if (!job) return isChinese ? '正在加载任务信息。' : 'Loading job details.'
    if (job.status === 'queued') return isChinese ? '任务已进入队列，页面会按设置自动刷新。' : 'The job is queued and will refresh automatically.'
    if (job.status === 'running') return isChinese ? '任务正在运行，可查看 stdout / stderr 跟踪进度。' : 'The job is running. Check stdout and stderr for progress.'
    if (job.status === 'succeeded') return isChinese ? '任务已成功完成，结果摘要已可查看。' : 'The job finished successfully and the result summary is available.'
    if (job.status === 'cancelled') return isChinese ? `任务已取消。${summarizeLog(stderrLog, true)}` : `The job was cancelled. ${summarizeLog(stderrLog, false)}`
    if (job.status === 'failed') return isChinese ? `任务执行失败。${summarizeLog(stderrLog, true)}` : `The job failed. ${summarizeLog(stderrLog, false)}`
    return isChinese ? '任务状态未知。' : 'Unknown job status.'
  }, [isChinese, job, stderrLog])

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
      setShareMessage(isChinese ? '结果链接已复制。' : 'Result link copied.')
      window.setTimeout(() => setShareMessage(''), 2500)
    } catch {
      setShareMessage(isChinese ? '复制链接失败，请手动复制地址栏。' : 'Copy failed. Please copy the address bar manually.')
      window.setTimeout(() => setShareMessage(''), 2500)
    }
  }

  async function handleCopyPreviewSequence() {
    if (!previewSequence) return

    try {
      await copyText(formatSequenceAsFasta(previewSequence))
      setShareMessage(isChinese ? 'FASTA 已复制到剪贴板。' : 'FASTA copied to clipboard.')
      window.setTimeout(() => setShareMessage(''), 2500)
    } catch {
      setShareMessage(isChinese ? '复制 FASTA 失败。' : 'Failed to copy FASTA.')
      window.setTimeout(() => setShareMessage(''), 2500)
    }
  }

  function handleDownloadPreviewSequence() {
    if (!previewSequence) return
    downloadTextFile(formatSequenceAsFasta(previewSequence), `${previewSequence.id || 'sequence'}.fa`)
    setShareMessage(isChinese ? 'FASTA 已开始下载。' : 'FASTA download started.')
    window.setTimeout(() => setShareMessage(''), 2500)
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
        <p className="eyebrow">{t('blastDetail.eyebrow')}</p>
        <h2>{id}</h2>
        <p className="page-copy">{t('blastDetail.copy')}</p>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <article className={summary ? `${statusTone} blast-report-status` : statusTone}>
        <div className="toolbar">
          <div className="toolbar-group">
            <strong>{t('blastDetail.statusHint')}</strong>
            <span>{statusMessage}</span>
          </div>
          <div className="toolbar-group">
            {!summary ? (
              <>
                <Link className="secondary-button action-link" to="/blast/new">
                  {isChinese ? '新建搜索' : 'New Search'}
                </Link>
                <Link className="secondary-button action-link" to={`/blast/new?from_job=${id}`}>
                  {t('blastDetail.editSearch')}
                </Link>
                <button className="secondary-button" onClick={handleCopyLink} type="button">
                  {t('blastDetail.copyLink')}
                </button>
                <a className="secondary-button action-link" href={shareMailtoHref}>
                  {t('blastDetail.mailShare')}
                </a>
                {resultApiUrl ? (
                  <a className="secondary-button action-link" href={resultApiUrl} rel="noreferrer" target="_blank">
                    {isChinese ? '结果 API' : 'Result API'}
                  </a>
                ) : null}
              </>
            ) : null}
            <label className="inline-toggle">
              <input
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
                type="checkbox"
              />
              <span>{t('jobs.autoRefresh')}</span>
            </label>
            <button className="secondary-button" disabled={refreshing} onClick={loadJob} type="button">
              {refreshing ? t('jobs.refreshing') : t('blastDetail.refreshNow')}
            </button>
            {(job?.status === 'queued' || job?.status === 'running') ? (
              <button className="secondary-button danger-button" onClick={handleCancel} type="button">
                {t('blastDetail.cancel')}
              </button>
            ) : null}
          </div>
        </div>
        <p className="toolbar-note">
          {isChinese
            ? `最近刷新时间：${lastLoadedAt || '尚未完成首次加载'}${autoRefresh ? '，运行中任务会每 3 秒自动刷新。' : '，当前为手动刷新模式。'}`
            : `Last refreshed: ${lastLoadedAt || 'not loaded yet'}${autoRefresh ? ', running jobs refresh every 3 seconds.' : ', manual refresh mode.'}`}
        </p>
        {shareMessage ? <p className="toolbar-note">{shareMessage}</p> : null}
      </article>

      {summary ? (
        <div className="blast-report-layout">
          <aside className="result-box blast-report-sidebar">
            <section className="blast-report-sidebar-section">
              <h3 className="blast-report-sidebar-title">{reportSummaryLabel}</h3>
              <p className="toolbar-note blast-report-sidebar-note">
                {isChinese
                  ? `当前定位：${selectedQueryIndex >= 0 ? `Query ${formatCount(selectedQueryIndex + 1)} / ${formatCount(filteredQueries.length)}` : '尚未选中 query'}${selectedQueryHash ? `，锚点 ${selectedQueryHash}` : ''}`
                  : `Current location: ${selectedQueryIndex >= 0 ? `Query ${formatCount(selectedQueryIndex + 1)} / ${formatCount(filteredQueries.length)}` : 'no query selected'}${selectedQueryHash ? `, anchor ${selectedQueryHash}` : ''}`}
              </p>
              <div className="action-list blast-report-sidebar-actions">
                <Link className="secondary-button action-link" to="/blast/new">
                  {isChinese ? '新建搜索' : 'New Search'}
                </Link>
                <Link className="secondary-button action-link" to={`/blast/new?from_job=${id}`}>
                  {t('blastDetail.editSearch')}
                </Link>
                <button className="secondary-button" onClick={handleCopyLink} type="button">
                  {t('blastDetail.copyLink')}
                </button>
                <a className="secondary-button action-link" href={shareMailtoHref}>
                  {t('blastDetail.mailShare')}
                </a>
                {resultApiUrl ? (
                  <a className="secondary-button action-link" href={resultApiUrl} rel="noreferrer" target="_blank">
                    {isChinese ? '结果 API' : 'Result API'}
                  </a>
                ) : null}
              </div>
            </section>

            {(previousQuery || nextQuery) ? (
              <section className="blast-report-sidebar-section">
                <h4 className="blast-report-sidebar-subtitle">{isChinese ? 'Query 导航' : 'Query Navigation'}</h4>
                <div className="blast-report-query-jump">
                  <button
                    className="secondary-button"
                    disabled={!previousQuery}
                    onClick={() => previousQuery && selectQuery(previousQuery.id, { scrollToDetail: true })}
                    type="button"
                  >
                    {isChinese ? '上一个 Query' : 'Previous Query'}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!nextQuery}
                    onClick={() => nextQuery && selectQuery(nextQuery.id, { scrollToDetail: true })}
                    type="button"
                  >
                    {isChinese ? '下一个 Query' : 'Next Query'}
                  </button>
                </div>
              </section>
            ) : null}

            <section className="blast-report-sidebar-section">
              <label className="filter-field blast-report-filter">
                <span>{isChinese ? '筛选 query' : 'Filter Queries'}</span>
                <input
                  value={queryFilter}
                  onChange={(event) => setQueryFilter(event.target.value)}
                  placeholder={isChinese ? '输入 query ID 或标题' : 'Enter query ID or title'}
                />
              </label>
              <p className="toolbar-note blast-report-sidebar-note">
                {isChinese
                  ? `共 ${formatCount(filteredQueries.length)} 个 query，点击左侧条目可直接切换到对应结果。`
                  : `${formatCount(filteredQueries.length)} queries total. Click an item to open its report section.`}
              </p>
              <div className="blast-report-index">
                {filteredQueries.map((query, index) => (
                  <button
                    className={query.id === selectedQuery?.id ? 'blast-report-index-item active' : 'blast-report-index-item'}
                    key={query.id}
                    onClick={() => selectQuery(query.id, { scrollToDetail: true })}
                    type="button"
                  >
                    <span className="blast-report-index-number">{formatCount(query.number ?? index + 1)}</span>
                    <span className="blast-report-index-body">
                      <strong>{query.id}</strong>
                      {query.title && query.title !== '-' ? <span>{query.title}</span> : null}
                      <span className="blast-report-index-meta">
                        {isChinese
                          ? `长度 ${formatCount(query.length)} · 命中 ${formatCount(query.hitCount)}`
                          : `Length ${formatCount(query.length)} · Hits ${formatCount(query.hitCount)}`}
                      </span>
                    </span>
                  </button>
                ))}
                {!filteredQueries.length ? (
                  <p className="toolbar-note">{isChinese ? '没有匹配的 query。' : 'No matching queries.'}</p>
                ) : null}
              </div>
            </section>

            {job?.downloads?.length ? (
              <section className="blast-report-sidebar-section">
                <h4 className="blast-report-sidebar-subtitle">{isChinese ? '结果导出' : 'Result Downloads'}</h4>
                <div className="action-list blast-report-sidebar-actions">
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
              </section>
            ) : null}
          </aside>

          <div className="blast-report-main">
            <section className="result-box blast-report-section">
              <div className="blast-report-section-header">
                <h3>Run Summary</h3>
                <span className="blast-report-section-kicker">{reportProgram}</span>
              </div>
              <div className="blast-report-summary-lines">
                <p>
                  <strong>SequenceServer</strong>{' '}
                  {isChinese ? '使用' : 'using'}{' '}
                  <strong>{summary.programVersion || reportProgram}</strong>
                  {job?.submitted_at ? (isChinese ? `，提交时间 ${job.submitted_at}` : `, query submitted on ${job.submitted_at}`) : ''}
                </p>
                <p>
                  <strong>{isChinese ? '数据库' : 'Databases'}:</strong>{' '}
                  {summary.databaseTitles.length ? summary.databaseTitles.join(isChinese ? '，' : ', ') : '-'}
                  {(sequenceCountLabel || characterCountLabel)
                    ? ` (${sequenceCountLabel || '-'} ${isChinese ? '条序列' : 'sequences'}, ${characterCountLabel || '-'} ${isChinese ? '个字符' : 'characters'})`
                    : ''}
                </p>
                {summary.params.length ? (
                  <p>
                    <strong>{isChinese ? '参数' : 'Parameters'}:</strong>{' '}
                    {summary.params.map((item) => `${item.key} ${item.value}`).join(', ')}
                  </p>
                ) : null}
                <p>
                  <strong>{isChinese ? '搜索 ID' : 'Search ID'}:</strong> {summary.searchId || id}
                </p>
                <p>
                  <strong>{isChinese ? '引用' : 'Citation'}:</strong>{' '}
                  <a href="https://doi.org/10.1093/molbev/msz185" rel="noreferrer" target="_blank">
                    https://doi.org/10.1093/molbev/msz185
                  </a>
                </p>
              </div>
              <div className="blast-report-stat-strip">
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '查询数' : 'Queries'}</span>
                  <strong>{formatCount(summary.queryCount)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '有命中的查询' : 'Queries With Hits'}</span>
                  <strong>{formatCount(summary.queriesWithHits)}</strong>
                </div>
                <div className="result-stat">
                  <span className="result-stat-label">{isChinese ? '总命中数' : 'Total Hits'}</span>
                  <strong>{formatCount(summary.totalHits)}</strong>
                </div>
              </div>
            </section>

            <section className="result-box blast-report-section">
              <div className="blast-report-section-header">
                <h3>Graphical Overview</h3>
              </div>
              {hasGraphicalOverview ? (
                <BlastVisualOverview selectedQuery={selectedQuery} summary={summary} />
              ) : (
                <p className="toolbar-note">
                  {isChinese
                    ? '当前结果中的命中数量不足以展示全局图形总览。'
                    : 'There are not enough hits in the current result set to render the graphical overview.'}
                </p>
              )}
            </section>

            {selectedQuery ? (
              <section className="result-box report-query-section blast-report-section" id={QUERY_DETAIL_SECTION_ID}>
                <div className="report-query-header">
                  <div className="report-query-title">
                    <h3>
                      <strong>Query=</strong>
                      <span>{selectedQuery.id}</span>
                      {selectedQuery.title && selectedQuery.title !== '-' ? <span>{selectedQuery.title}</span> : null}
                    </h3>
                  </div>
                  <span className="report-query-meta">
                    {selectedQueryIndex >= 0
                      ? isChinese
                        ? `query ${formatCount(selectedQueryIndex + 1)}，长度 ${formatCount(selectedQuery.length)}，命中 ${formatCount(selectedQuery.hitCount)}`
                        : `query ${formatCount(selectedQueryIndex + 1)}, length ${formatCount(selectedQuery.length)}, hits ${formatCount(selectedQuery.hitCount)}`
                      : isChinese
                        ? `长度 ${formatCount(selectedQuery.length)}，命中 ${formatCount(selectedQuery.hitCount)}`
                        : `length ${formatCount(selectedQuery.length)}, hits ${formatCount(selectedQuery.hitCount)}`}
                  </span>
                </div>

                <div className="report-query-toolbar">
                  <span className="toolbar-note">
                    {isChinese
                      ? `当前 query：${formatCount(selectedQueryIndex + 1)} / ${formatCount(filteredQueries.length)}${selectedQueryHash ? `，锚点 ${selectedQueryHash}` : ''}`
                      : `Current query: ${formatCount(selectedQueryIndex + 1)} / ${formatCount(filteredQueries.length)}${selectedQueryHash ? `, anchor ${selectedQueryHash}` : ''}`}
                  </span>
                </div>

                <BlastQueryOverview
                  algorithm={summary.program || job?.method || 'blastn'}
                  onFocusHit={focusHitCard}
                  query={selectedQuery}
                  searchId={summary.searchId || id}
                  variant="inline"
                />

                <section className="report-query-subsection">
                  <div className="report-query-subsection-header">
                    <h4>{isChinese ? '命中总表' : 'Hit Table'}</h4>
                  </div>
                  <p className="toolbar-note report-query-subsection-copy">
                    {isChinese
                      ? '按旧版结果页常用方式提供 query 级命中总表，点击表内条目可直接定位到下方对应命中卡片。'
                      : 'Provides a query-level hit table similar to the legacy result page. Click a row to jump to the corresponding hit card below.'}
                  </p>
                  <div className="table-scroll">
                    <table className="result-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>{isChinese ? '相似序列' : 'Similar Sequences'}</th>
                          {selectedQueryHasSpecies ? <th>{isChinese ? '物种' : 'Species'}</th> : null}
                          <th>{isChinese ? 'Query 覆盖度 (%)' : 'Query Coverage (%)'}</th>
                          <th>{isChinese ? '总分' : 'Total Score'}</th>
                          <th>{isChinese ? 'E 值' : 'E-value'}</th>
                          <th>{isChinese ? '一致性 (%)' : 'Identity (%)'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedQuery.hits.map((hit, index) => {
                          const firstHsp = hit.hsps[0]

                          return (
                            <tr key={`${selectedQuery.id}-table-${hit.id}`}>
                              <td>{index + 1}</td>
                              <td>
                                <button className="table-link-button" onClick={() => focusHitCard(hit.id)} type="button">
                                  {hit.id} {hit.title && hit.title !== '-' ? hit.title : ''}
                                </button>
                              </td>
                              {selectedQueryHasSpecies ? <td>{hit.sciname || '-'}</td> : null}
                              <td>{typeof hit.qcovs === 'number' ? hit.qcovs : '-'}</td>
                              <td>{typeof hit.totalScore === 'number' ? hit.totalScore : '-'}</td>
                              <td>{formatEvalueDisplay(firstHsp?.evalue)}</td>
                              <td>{formatIdentityPercent(firstHsp?.identity, firstHsp?.length)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="report-query-subsection">
                  <div className="report-query-subsection-header">
                    <h4>{isChinese ? '命中列表' : 'Hits'}</h4>
                    <span className="toolbar-note">
                      {isChinese
                        ? `当前 query 共 ${formatCount(selectedQuery.hitCount)} 个命中，当前第 ${formatCount(hitPage)} / ${formatCount(totalHitPages)} 页。`
                        : `This query has ${formatCount(selectedQuery.hitCount)} hits, page ${formatCount(hitPage)} / ${formatCount(totalHitPages)}.`}
                    </span>
                  </div>
                  <div className="report-query-toolbar">
                    <div className="toolbar-group">
                      {HIT_PAGE_SIZE_OPTIONS.map((size) => (
                        <button
                          className={hitPageSize === size ? 'secondary-button active' : 'secondary-button'}
                          key={size}
                          onClick={() => setHitPageSize(size)}
                          type="button"
                        >
                          {isChinese ? `每页 ${size}` : `${size} / page`}
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
                        {isChinese ? '上一页' : 'Previous'}
                      </button>
                      <button
                        className="secondary-button"
                        disabled={hitPage >= totalHitPages}
                        onClick={() => setHitPage((current) => Math.min(totalHitPages, current + 1))}
                        type="button"
                      >
                        {isChinese ? '下一页' : 'Next'}
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
                      {isChinese ? '下载已选 hits FASTA' : 'Download Selected Hits FASTA'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!selectedHitIds.length}
                      onClick={handleDownloadSelectedHitsAlignment}
                      type="button"
                    >
                      {isChinese ? '下载已选 hits Alignment' : 'Download Selected Hits Alignment'}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!selectedQuery.hits.length || !databaseIds.length}
                      onClick={handleDownloadAllQueryHits}
                      type="button"
                    >
                      {isChinese ? '下载当前 query 全部命中 FASTA' : 'Download All Hits for This Query'}
                    </button>
                  </div>
                  <p className="toolbar-note">
                    {isChinese
                      ? `已选择 ${formatCount(selectedHitIds.length)} 个 hit。${selectedHitDownloadUrl ? ` 也可直接通过 ${selectedHitDownloadUrl} 发起 GET 下载。` : ''}`
                      : `${formatCount(selectedHitIds.length)} hits selected.${selectedHitDownloadUrl ? ` You can also use ${selectedHitDownloadUrl} for a direct GET download.` : ''}`}
                  </p>
                  {previewLoading ? <p>{isChinese ? '命中序列加载中...' : 'Loading hit sequence...'}</p> : null}
                  {previewError ? <p className="error-text">{previewError}</p> : null}
                  {previewSequence ? (
                    <div className="sequence-preview">
                      <div className="toolbar">
                        <div className="toolbar-group">
                          <strong>{previewSequence.id}</strong>
                          <span>{previewSequence.title || '-'}</span>
                        </div>
                        <div className="toolbar-group">
                          <span>{isChinese ? '长度' : 'Length'}：{formatCount(previewSequence.length)}</span>
                          <button className="secondary-button" onClick={handleCopyPreviewSequence} type="button">
                            {isChinese ? '复制 FASTA' : 'Copy FASTA'}
                          </button>
                          <button className="secondary-button" onClick={handleDownloadPreviewSequence} type="button">
                            {isChinese ? '下载 FASTA' : 'Download FASTA'}
                          </button>
                        </div>
                      </div>
                      <pre className="sequence-box">{formatSequenceAsFasta(previewSequence)}</pre>
                    </div>
                  ) : null}
                </section>

                <div className="list report-hit-list">
                  {visibleHits.map((hit) => {
                    const firstHsp = hit.hsps[0]
                    const checked = selectedHitIds.includes(hit.id)

                    return (
                      <div className="subresult-card report-hit-card" id={hitCardId(selectedQuery.id, hit.id)} key={`${selectedQuery.id}-${hit.id}`}>
                        <div className="subresult-card-header">
                          <div className="subresult-card-title">
                            <strong>{hit.id}</strong>
                            {hit.title && hit.title !== '-' ? <span>{hit.title}</span> : null}
                          </div>
                          <div className="subresult-card-actions">
                            <label className="inline-toggle">
                              <input
                                checked={checked}
                                onChange={(event) => toggleHitSelection(hit.id, event.target.checked)}
                                type="checkbox"
                              />
                              <span>{isChinese ? '选中' : 'Select'}</span>
                            </label>
                            <button
                              className={previewSequence?.id === hit.id ? 'secondary-button active' : 'secondary-button'}
                              onClick={() => handlePreviewSequence(hit.id)}
                              type="button"
                            >
                              {isChinese ? '查看序列' : 'View Sequence'}
                            </button>
                          </div>
                        </div>
                        {appConfig.hitActions.length ? (
                          <div className="action-list">
                            {resolveHitActions(
                              appConfig.hitActions,
                              {
                                jobId: id,
                                queryId: selectedQuery.id,
                                queryTitle: selectedQuery.title,
                                hitId: hit.id,
                                hitTitle: hit.title,
                                species: hit.sciname,
                                databaseIds,
                              },
                              isChinese,
                            ).map((action) => (
                              <a
                                className="secondary-button action-link"
                                href={action.url}
                                key={`${hit.id}-${action.id}`}
                                rel={action.target === '_blank' ? 'noreferrer' : undefined}
                                target={action.target}
                              >
                                {action.label}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {hit.links.length ? (
                          <div className="action-list">
                            {hit.links.map((link, index) => (
                              <a
                                className="secondary-button action-link"
                                href={link.url}
                                key={`${hit.id}-link-${index}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {link.title}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {hit.accession ? <span>{isChinese ? 'Accession' : 'Accession'}：{hit.accession}</span> : null}
                        <span>{isChinese ? '长度' : 'Length'}：{formatCount(hit.length)}</span>
                        <span>{isChinese ? '总分' : 'Total Score'}：{typeof hit.totalScore === 'number' ? hit.totalScore : '-'}</span>
                        <span>{isChinese ? 'Query 覆盖度' : 'Query Coverage'}：{typeof hit.qcovs === 'number' ? `${hit.qcovs}%` : '-'}</span>
                        <span>{isChinese ? '物种' : 'Species'}：{hit.sciname || '-'}</span>
                        {firstHsp ? (
                          <div className="key-value-grid">
                            <div className="key-value-item">
                              <span>{isChinese ? 'E 值' : 'E-value'}</span>
                              <strong>{firstHsp.evalue ?? '-'}</strong>
                            </div>
                            <div className="key-value-item">
                              <span>{isChinese ? 'Bit Score' : 'Bit Score'}</span>
                              <strong>{firstHsp.bitScore ?? '-'}</strong>
                            </div>
                            <div className="key-value-item">
                              <span>{isChinese ? '一致性' : 'Identity'}</span>
                              <strong>{firstHsp.identity ?? '-'}</strong>
                            </div>
                            <div className="key-value-item">
                              <span>{isChinese ? '比对长度' : 'Alignment Length'}</span>
                              <strong>{firstHsp.length ?? '-'}</strong>
                            </div>
                            <div className="key-value-item">
                              <span>{isChinese ? 'HSP Query 覆盖度' : 'HSP Query Coverage'}</span>
                              <strong>{typeof firstHsp.qcovhsp === 'number' ? `${firstHsp.qcovhsp}%` : '-'}</strong>
                            </div>
                            <div className="key-value-item">
                              <span>{isChinese ? 'Query 区间' : 'Query Range'}</span>
                              <strong>{firstHsp.qstart ?? '-'} - {firstHsp.qend ?? '-'}</strong>
                            </div>
                            <div className="key-value-item">
                              <span>{isChinese ? 'Subject 区间' : 'Subject Range'}</span>
                              <strong>{firstHsp.sstart ?? '-'} - {firstHsp.send ?? '-'}</strong>
                            </div>
                          </div>
                        ) : (
                          <span>{isChinese ? '首个 HSP：无' : 'First HSP: none'}</span>
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
                  {!selectedQuery.hits.length ? <p>{isChinese ? '该 query 没有命中结果。' : 'This query has no hits.'}</p> : null}
                </div>
              </section>
            ) : (
              <section className="result-box blast-report-section">
                <p>{isChinese ? '当前筛选条件下没有可展示的 query。' : 'No query is available under the current filter.'}</p>
              </section>
            )}

            <CollapsibleSection
              className="result-box"
              defaultCollapsed={true}
              storageKey={`blast:${id}:execution-details`}
              title={isChinese ? '执行细节' : 'Execution Details'}
              actions={
                <>
                  {resultApiUrl ? (
                    <a className="secondary-button action-link" href={resultApiUrl} rel="noreferrer" target="_blank">
                      {isChinese ? '结果 API' : 'Result API'}
                    </a>
                  ) : null}
                  {stdoutApiUrl ? (
                    <a className="secondary-button action-link" href={stdoutApiUrl} rel="noreferrer" target="_blank">
                      stdout API
                    </a>
                  ) : null}
                  {stderrApiUrl ? (
                    <a className="secondary-button action-link" href={stderrApiUrl} rel="noreferrer" target="_blank">
                      stderr API
                    </a>
                  ) : null}
                </>
              }
            >
              {job ? (
                <div className="detail-grid">
                  <span>{isChinese ? '状态' : 'Status'}：{job.status}</span>
                  <span>{isChinese ? '方法' : 'Method'}：{job.method || '-'}</span>
                  <span>{isChinese ? '提交时间' : 'Submitted At'}：{job.submitted_at}</span>
                  <span>{isChinese ? '开始时间' : 'Started At'}：{job.started_at || '-'}</span>
                  <span>{isChinese ? '完成时间' : 'Completed At'}：{job.completed_at || '-'}</span>
                  <span>{isChinese ? '退出码' : 'Exit Code'}：{typeof job.exitstatus === 'number' ? job.exitstatus : '-'}</span>
                  <span>{isChinese ? '数据库数量' : 'Database Count'}：{formatCount(job.databases?.length)}</span>
                  <span>{isChinese ? '结果接口' : 'Result API'}：{job.result_url || (isChinese ? '尚未可用' : 'Not available yet')}</span>
                </div>
              ) : (
                <p>{isChinese ? '加载中...' : 'Loading...'}</p>
              )}
              {summary.stats.length ? (
                <div className="key-value-grid">
                  {summary.stats.map((item) => (
                    <div key={item.key} className="key-value-item">
                      <span>{item.key}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection
              className="result-box"
              defaultCollapsed={true}
              storageKey={`blast:${id}:raw-json`}
              title={isChinese ? '原始结果 JSON' : 'Raw Result JSON'}
            >
              <pre className="log-box">{JSON.stringify(result, null, 2)}</pre>
            </CollapsibleSection>
          </div>
        </div>
      ) : (
        <div className="two-column">
          <article className="panel">
            <h3>{t('blastDetail.taskStatus')}</h3>
            {job ? (
              <div className="detail-grid">
                <span>{isChinese ? '状态' : 'Status'}：{job.status}</span>
                <span>{isChinese ? '方法' : 'Method'}：{job.method || '-'}</span>
                <span>{isChinese ? '提交时间' : 'Submitted At'}：{job.submitted_at}</span>
                <span>{isChinese ? '开始时间' : 'Started At'}：{job.started_at || '-'}</span>
                <span>{isChinese ? '完成时间' : 'Completed At'}：{job.completed_at || '-'}</span>
                <span>{isChinese ? '退出码' : 'Exit Code'}：{typeof job.exitstatus === 'number' ? job.exitstatus : '-'}</span>
                <span>{isChinese ? '数据库数量' : 'Database Count'}：{formatCount(job.databases?.length)}</span>
                <span>{isChinese ? '结果接口' : 'Result API'}：{job.result_url || (isChinese ? '尚未可用' : 'Not available yet')}</span>
              </div>
            ) : (
              <p>{isChinese ? '加载中...' : 'Loading...'}</p>
            )}
          </article>

          <article className="panel">
            <h3>{t('blastDetail.resultSummary')}</h3>
            {resultWarning ? (
              <div className="result-stack">
                <div className="result-box list-item-warning">
                  <h4>{isChinese ? '大结果预警' : 'Large Result Warning'}</h4>
                  <p>{resultWarning.message}</p>
                  {resultWarning.detail ? <p className="toolbar-note">{resultWarning.detail}</p> : null}
                  <div className="detail-grid">
                    <span>{isChinese ? '结果大小' : 'Result Size'}：{formatCount(resultWarning.xml_file_size)} bytes</span>
                    <span>{isChinese ? '预警阈值' : 'Warning Threshold'}：{formatCount(resultWarning.threshold)} bytes</span>
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
                        {isChinese ? `下载 ${link.label}` : `Download ${link.label}`}
                      </a>
                    ))}
                    <button className="primary-button" onClick={handleLoadLargeResultAnyway} type="button">
                      {isChinese ? '继续在浏览器中加载' : 'Continue Loading in Browser'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p>{isChinese ? '任务未完成或结果尚未加载。' : 'The job is not finished or the result has not been loaded yet.'}</p>
            )}
          </article>
        </div>
      )}

      <div className={summary ? 'blast-report-log-grid' : 'two-column'}>
        <article className="panel">
          <CollapsibleSection
            className=""
            defaultCollapsed={true}
            storageKey={`blast:${id}:stdout`}
            title={isChinese ? 'stdout 日志' : 'stdout Log'}
            actions={
              stdoutApiUrl ? (
                <a className="secondary-button action-link" href={stdoutApiUrl} rel="noreferrer" target="_blank">
                  {isChinese ? '打开 API' : 'Open API'}
                </a>
              ) : undefined
            }
          >
            <p className="toolbar-note">{isChinese ? '摘要' : 'Summary'}：{summarizeLog(stdoutLog, isChinese)}</p>
            <pre className="log-box">{stdoutLog?.content || (isChinese ? '暂无输出' : 'No output')}</pre>
          </CollapsibleSection>
        </article>
        <article className="panel">
          <CollapsibleSection
            className=""
            defaultCollapsed={true}
            storageKey={`blast:${id}:stderr`}
            title={isChinese ? 'stderr 日志' : 'stderr Log'}
            actions={
              stderrApiUrl ? (
                <a className="secondary-button action-link" href={stderrApiUrl} rel="noreferrer" target="_blank">
                  {isChinese ? '打开 API' : 'Open API'}
                </a>
              ) : undefined
            }
          >
            <p className="toolbar-note">{isChinese ? '摘要' : 'Summary'}：{summarizeLog(stderrLog, isChinese)}</p>
            <pre className="log-box">{stderrLog?.content || (isChinese ? '暂无输出' : 'No output')}</pre>
          </CollapsibleSection>
        </article>
      </div>
    </section>
  )
}
