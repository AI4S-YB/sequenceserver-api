import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiClientError, createBlastJob, fetchBlastFormConfig, fetchBlastJobInput } from '../lib/api'
import { formatCount } from '../lib/job-results'
import { normalizeSequenceInput } from '../lib/sequence-input'
import type { BlastMethodOption, Database, Job } from '../types/api'

type BlastMethod = 'blastn' | 'blastp' | 'blastx' | 'tblastn' | 'tblastx'

const methodMeta: Record<
  BlastMethod,
  { label: string; queryType: 'nucleotide' | 'protein'; databaseType: 'nucleotide' | 'protein'; helper: string }
> = {
  blastn: {
    label: 'blastn',
    queryType: 'nucleotide',
    databaseType: 'nucleotide',
    helper: '核酸 query 对核酸数据库',
  },
  blastp: {
    label: 'blastp',
    queryType: 'protein',
    databaseType: 'protein',
    helper: '蛋白 query 对蛋白数据库',
  },
  blastx: {
    label: 'blastx',
    queryType: 'nucleotide',
    databaseType: 'protein',
    helper: '核酸 query 翻译后对蛋白数据库',
  },
  tblastn: {
    label: 'tblastn',
    queryType: 'protein',
    databaseType: 'nucleotide',
    helper: '蛋白 query 对核酸数据库翻译搜索',
  },
  tblastx: {
    label: 'tblastx',
    queryType: 'nucleotide',
    databaseType: 'nucleotide',
    helper: '核酸 query 与核酸数据库双向翻译搜索',
  },
}

const BLAST_METHODS: BlastMethod[] = ['blastn', 'blastp', 'blastx', 'tblastn', 'tblastx']

function normalizeType(type: string): 'nucleotide' | 'protein' | null {
  if (type === 'nucleotide' || type === 'protein') return type
  return null
}

function compatibleMethods(selectedDatabases: Database[]): BlastMethod[] {
  if (!selectedDatabases.length) return ['blastn', 'blastp', 'blastx', 'tblastn', 'tblastx']

  const databaseTypes = new Set(selectedDatabases.map((database) => normalizeType(database.type)).filter(Boolean))
  if (databaseTypes.size !== 1) return []

  const [databaseType] = [...databaseTypes] as Array<'nucleotide' | 'protein'>

  return (Object.keys(methodMeta) as BlastMethod[]).filter(
    (method) => methodMeta[method].databaseType === databaseType,
  )
}

function inferSuggestedMethod(selectedDatabases: Database[]): BlastMethod {
  const methods = compatibleMethods(selectedDatabases)
  return methods[0] || 'blastn'
}

function ValidationMessage({ message }: { message: string }) {
  if (!message) return null
  return <p className="error-text">{message}</p>
}

export function BlastNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromJobId = searchParams.get('from_job') || ''
  const [databases, setDatabases] = useState<Database[]>([])
  const [configuredMethods, setConfiguredMethods] = useState<BlastMethodOption[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [sequence, setSequence] = useState('>query_1\nACTGACTGACTG')
  const [method, setMethod] = useState<BlastMethod>('blastn')
  const [advanced, setAdvanced] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')
  const [inputNotice, setInputNotice] = useState('')
  const [submitNotice, setSubmitNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [prefillSourceJobId, setPrefillSourceJobId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openInNewTab, setOpenInNewTab] = useState(false)
  const [advancedInitialized, setAdvancedInitialized] = useState(false)

  useEffect(() => {
    fetchBlastFormConfig()
      .then((config) => {
        setDatabases(config.databases)
        setConfiguredMethods(config.methods)
        if (!fromJobId && config.databases[0]) {
          setSelected([config.databases[0].id])
          setMethod(inferSuggestedMethod([config.databases[0]]))
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '加载搜索表单配置失败'))
      .finally(() => setLoading(false))
  }, [fromJobId])

  useEffect(() => {
    if (!fromJobId) return

    setPrefillLoading(true)
    fetchBlastJobInput(fromJobId)
      .then((input) => {
        setSequence(input.sequence)
        setSelected(input.database_ids)
        if (Object.keys(methodMeta).includes(input.method)) {
          setMethod(input.method as BlastMethod)
        }
        setAdvanced(input.advanced || '')
        setAdvancedInitialized(true)
        setPrefillSourceJobId(input.id)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : '回填旧任务参数失败'))
      .finally(() => setPrefillLoading(false))
  }, [fromJobId])

  const selectedDatabases = useMemo(
    () => databases.filter((database) => selected.includes(database.id)),
    [databases, selected],
  )
  const supportedMethods = useMemo(() => {
    const configured = configuredMethods
      .map((item) => item.id)
      .filter((item): item is BlastMethod => BLAST_METHODS.includes(item as BlastMethod))

    return configured.length ? configured : BLAST_METHODS
  }, [configuredMethods])
  const methodDetails = useMemo(() => {
    const configured = configuredMethods.find((item) => item.id === method)
    if (configured) {
      return {
        label: configured.label,
        queryType: configured.query_type,
        databaseType: configured.database_type,
        helper: configured.helper,
        defaultAdvanced: configured.default_advanced,
      }
    }

    return {
      ...methodMeta[method],
      defaultAdvanced: '',
    }
  }, [configuredMethods, method])

  const availableMethods = useMemo(
    () => compatibleMethods(selectedDatabases),
    [selectedDatabases],
  )

  useEffect(() => {
    if (!availableMethods.includes(method)) {
      setMethod(inferSuggestedMethod(selectedDatabases))
    }
  }, [availableMethods, method, selectedDatabases])

  useEffect(() => {
    if (fromJobId || advancedInitialized) return
    if (!methodDetails.defaultAdvanced) return

    setAdvanced(methodDetails.defaultAdvanced)
    setAdvancedInitialized(true)
  }, [advancedInitialized, fromJobId, methodDetails.defaultAdvanced])

  const validationError = useMemo(() => {
    if (!sequence.trim()) return '查询序列不能为空。'
    if (!selected.length) return '至少选择一个数据库。'
    if (!selectedDatabases.length) return '所选数据库不存在，请重新选择。'
    if (!availableMethods.length) return '当前不能混选不同类型的数据库，请只选择同一类型数据库。'
    if (!availableMethods.includes(method)) return '当前所选数据库与 BLAST 方法不兼容。'
    return ''
  }, [availableMethods, method, selected, selectedDatabases.length, sequence])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setJob(null)
    setSubmitNotice('')

    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    const holdingUrl = new URL('/jobs', window.location.origin)
    let resultWindow: Window | null = null

    if (openInNewTab) {
      resultWindow = window.open(holdingUrl.toString(), '_blank')
    }

    try {
      const created = await createBlastJob({
        sequence,
        databases: selected,
        method,
        advanced,
      })
      setJob(created)
      const detailPath = `/jobs/blast/${created.id}`
      const detailUrl = new URL(detailPath, window.location.origin).toString()

      if (openInNewTab && resultWindow && !resultWindow.closed) {
        resultWindow.location.replace(detailUrl)
        setSubmitNotice('任务已创建，结果页已在新标签页打开。')
      } else {
        if (openInNewTab) {
          setSubmitNotice('浏览器阻止了新标签页，已自动在当前页打开结果。')
        }

        window.setTimeout(() => {
          navigate(detailPath)
        }, 300)
      }
    } catch (err) {
      if (resultWindow && !resultWindow.closed) {
        resultWindow.close()
      }
      setError(err instanceof ApiClientError ? err.message : '提交 BLAST 任务失败')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleDatabase(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  function handleSequenceChange(value: string) {
    const normalized = normalizeSequenceInput(value)
    setSequence(normalized.value)
    setInputNotice(normalized.convertedFromFastq ? '检测到 FASTQ，已自动转换为 FASTA。' : '')
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">BLAST 提交</p>
        <h2>基于新 API 的任务创建页</h2>
        <p className="page-copy">
          这里已经按前后端分离方式改造，支持数据库多选、方法联动、提交后跳转任务详情。
        </p>
        {prefillSourceJobId ? <p className="toolbar-note">当前正在基于任务 {prefillSourceJobId} 回填搜索参数。</p> : null}
        {inputNotice ? <p className="toolbar-note">{inputNotice}</p> : null}
        {submitNotice ? <p className="toolbar-note">{submitNotice}</p> : null}
      </header>

      <div className="card-grid">
        <article className="card">
          <p className="metric-label">可用数据库</p>
          <strong className="metric-value">{formatCount(databases.length)}</strong>
          <p className="metric-helper">从 `/api/v1/frontend/blast_form` 获取表单配置</p>
        </article>
        <article className="card">
          <p className="metric-label">当前已选数据库</p>
          <strong className="metric-value">{formatCount(selected.length)}</strong>
          <p className="metric-helper">建议同一次任务只选同一类型数据库</p>
        </article>
      </div>

      <div className="two-column">
        <article className="panel">
          <h3>任务参数</h3>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              <span>BLAST 方法</span>
              <select value={method} onChange={(event) => setMethod(event.target.value as BlastMethod)}>
                {supportedMethods.map((item) => (
                  <option disabled={!availableMethods.includes(item)} key={item} value={item}>
                    {item} ({configuredMethods.find((entry) => entry.id === item)?.helper || methodMeta[item].helper})
                  </option>
                ))}
              </select>
            </label>

            <div className="result-box">
              <h4>数据库选择</h4>
              {loading || prefillLoading ? <p>加载中...</p> : null}
              <div className="selection-list">
                {databases.map((database) => {
                  const checked = selected.includes(database.id)
                  const databaseType = normalizeType(database.type)
                  const allowed =
                    selectedDatabases.length === 0 ||
                    selectedDatabases.every((item) => normalizeType(item.type) === databaseType)

                  return (
                    <label className={`selection-item ${!allowed ? 'selection-item-disabled' : ''}`} key={database.id}>
                      <input
                        checked={checked}
                        disabled={!allowed && !checked}
                        onChange={() => toggleDatabase(database.id)}
                        type="checkbox"
                      />
                      <span>
                        {database.title} ({database.type})
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <label>
              <span>查询序列</span>
              <textarea rows={10} value={sequence} onChange={(event) => handleSequenceChange(event.target.value)} />
            </label>

            <label>
              <span>高级参数</span>
              <input
                value={advanced}
                onChange={(event) => setAdvanced(event.target.value)}
                placeholder={methodDetails.defaultAdvanced || '-evalue 1e-5'}
              />
            </label>

            <label className="inline-toggle">
              <input
                checked={openInNewTab}
                onChange={(event) => setOpenInNewTab(event.target.checked)}
                type="checkbox"
              />
              <span>提交后在新标签页打开结果</span>
            </label>

            <ValidationMessage message={validationError || error} />

            <button className="primary-button" disabled={submitting || Boolean(validationError)} type="submit">
              {submitting ? '提交中...' : '提交 BLAST 任务'}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>提交预览</h3>
          <div className="result-box">
            <h4>当前方法说明</h4>
            <p>方法：{methodDetails.label}</p>
            <p>Query 类型：{methodDetails.queryType}</p>
            <p>数据库类型：{methodDetails.databaseType}</p>
            <p>{methodDetails.helper}</p>
            <p>默认高级参数：{methodDetails.defaultAdvanced || '-'}</p>
          </div>

          <div className="result-box">
            <h4>当前数据库范围</h4>
            <div className="list">
              {selectedDatabases.map((database) => (
                <div className="list-item" key={database.id}>
                  <strong>{database.title}</strong>
                  <span>类型：{database.type}</span>
                  <code>{database.name}</code>
                </div>
              ))}
              {!selectedDatabases.length ? <p>尚未选择数据库。</p> : null}
            </div>
          </div>

          {job ? (
            <div className="result-box">
              <h4>任务已创建</h4>
              <p>任务 ID：{job.id}</p>
              <p>状态：{job.status}</p>
              <p>结果地址：{job.result_url || '尚未生成'}</p>
              <p>
                详情页：
                <Link to={`/jobs/blast/${job.id}`}> /jobs/blast/{job.id}</Link>
              </p>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  )
}
