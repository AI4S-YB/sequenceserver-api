import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiClientError, createBlastJob, fetchBlastFormConfig, fetchBlastJobInput } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { formatCount } from '../lib/job-results'
import { normalizeSequenceInput } from '../lib/sequence-input'
import type { BlastMethodOption, BlastQueryExample, Database, Job } from '../types/api'

type BlastMethod = 'blastn' | 'blastp' | 'blastx' | 'tblastn' | 'tblastx'

const methodMeta: Record<
  BlastMethod,
  {
    label: string
    queryType: 'nucleotide' | 'protein'
    databaseType: 'nucleotide' | 'protein'
    helperZh: string
    helperEn: string
  }
> = {
  blastn: {
    label: 'blastn',
    queryType: 'nucleotide',
    databaseType: 'nucleotide',
    helperZh: '核酸 query 对核酸数据库',
    helperEn: 'Nucleotide query against nucleotide databases',
  },
  blastp: {
    label: 'blastp',
    queryType: 'protein',
    databaseType: 'protein',
    helperZh: '蛋白 query 对蛋白数据库',
    helperEn: 'Protein query against protein databases',
  },
  blastx: {
    label: 'blastx',
    queryType: 'nucleotide',
    databaseType: 'protein',
    helperZh: '核酸 query 翻译后对蛋白数据库',
    helperEn: 'Translated nucleotide query against protein databases',
  },
  tblastn: {
    label: 'tblastn',
    queryType: 'protein',
    databaseType: 'nucleotide',
    helperZh: '蛋白 query 对核酸数据库翻译搜索',
    helperEn: 'Protein query against translated nucleotide databases',
  },
  tblastx: {
    label: 'tblastx',
    queryType: 'nucleotide',
    databaseType: 'nucleotide',
    helperZh: '核酸 query 与核酸数据库双向翻译搜索',
    helperEn: 'Translated nucleotide query against translated nucleotide databases',
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
  const { t, isChinese } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromJobId = searchParams.get('from_job') || ''
  const [databases, setDatabases] = useState<Database[]>([])
  const [configuredMethods, setConfiguredMethods] = useState<BlastMethodOption[]>([])
  const [queryExamples, setQueryExamples] = useState<Partial<Record<BlastMethod, BlastQueryExample>>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [sequence, setSequence] = useState('')
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
  const [sequenceEditedManually, setSequenceEditedManually] = useState(false)

  useEffect(() => {
    fetchBlastFormConfig()
      .then((config) => {
        setDatabases(config.databases)
        setConfiguredMethods(config.methods)
        setQueryExamples(config.query_examples as Partial<Record<BlastMethod, BlastQueryExample>>)
        if (!fromJobId && config.databases[0]) {
          setSelected([config.databases[0].id])
          setMethod(inferSuggestedMethod([config.databases[0]]))
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : (isChinese ? '加载搜索表单配置失败' : 'Failed to load BLAST form configuration')))
      .finally(() => setLoading(false))
  }, [fromJobId, isChinese])

  useEffect(() => {
    if (!fromJobId) return

    setPrefillLoading(true)
    fetchBlastJobInput(fromJobId)
      .then((input) => {
        setSequence(input.sequence)
        setSelected(input.database_ids)
        setSequenceEditedManually(true)
        if (Object.keys(methodMeta).includes(input.method)) {
          setMethod(input.method as BlastMethod)
        }
        setAdvanced(input.advanced || '')
        setAdvancedInitialized(true)
        setPrefillSourceJobId(input.id)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : (isChinese ? '回填旧任务参数失败' : 'Failed to prefill parameters from the previous job')))
      .finally(() => setPrefillLoading(false))
  }, [fromJobId, isChinese])

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
  const currentQueryExample = useMemo(
    () => queryExamples[method] || null,
    [method, queryExamples],
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

  useEffect(() => {
    if (fromJobId || sequenceEditedManually) return
    if (!currentQueryExample?.sequence) return

    setSequence(currentQueryExample.sequence)
  }, [currentQueryExample, fromJobId, sequenceEditedManually])

  const validationError = useMemo(() => {
    if (!sequence.trim()) return isChinese ? '查询序列不能为空。' : 'Query sequence cannot be empty.'
    if (!selected.length) return isChinese ? '至少选择一个数据库。' : 'Select at least one database.'
    if (!selectedDatabases.length) return isChinese ? '所选数据库不存在，请重新选择。' : 'The selected databases are not available anymore. Please choose again.'
    if (!availableMethods.length) return isChinese ? '当前不能混选不同类型的数据库，请只选择同一类型数据库。' : 'Mixed database types are not supported in one search. Select databases of the same type.'
    if (!availableMethods.includes(method)) return isChinese ? '当前所选数据库与 BLAST 方法不兼容。' : 'The selected databases are not compatible with the chosen BLAST method.'
    return ''
  }, [availableMethods, isChinese, method, selected, selectedDatabases.length, sequence])

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
        setSubmitNotice(isChinese ? '任务已创建，结果页已在新标签页打开。' : 'The job was created and the result page opened in a new tab.')
      } else {
        if (openInNewTab) {
          setSubmitNotice(isChinese ? '浏览器阻止了新标签页，已自动在当前页打开结果。' : 'The browser blocked the new tab, so the result page was opened in the current tab.')
        }

        window.setTimeout(() => {
          navigate(detailPath)
        }, 300)
      }
    } catch (err) {
      if (resultWindow && !resultWindow.closed) {
        resultWindow.close()
      }
      setError(err instanceof ApiClientError ? err.message : (isChinese ? '提交 BLAST 任务失败' : 'Failed to submit the BLAST job'))
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
    setSequenceEditedManually(true)
    setInputNotice(normalized.convertedFromFastq ? (isChinese ? '检测到 FASTQ，已自动转换为 FASTA。' : 'FASTQ detected and automatically converted to FASTA.') : '')
  }

  function handleUseExampleSequence() {
    if (!currentQueryExample?.sequence) return

    setSequence(currentQueryExample.sequence)
    setSequenceEditedManually(false)
    setInputNotice(
      isChinese
        ? `已加载示例：${currentQueryExample.label}`
        : `Loaded example: ${currentQueryExample.label}`,
    )
  }

  return (
    <section className="page">
      <header className="page-header">
        <p className="eyebrow">{t('blastNew.eyebrow')}</p>
        <h2>{t('blastNew.title')}</h2>
        <p className="page-copy">{t('blastNew.copy')}</p>
        {prefillSourceJobId ? <p className="toolbar-note">{isChinese ? `当前正在基于任务 ${prefillSourceJobId} 回填搜索参数。` : `Prefilling search parameters from job ${prefillSourceJobId}.`}</p> : null}
        {inputNotice ? <p className="toolbar-note">{inputNotice}</p> : null}
        {submitNotice ? <p className="toolbar-note">{submitNotice}</p> : null}
      </header>

      <div className="card-grid">
        <article className="card">
          <p className="metric-label">{t('blastNew.availableDatabases')}</p>
          <strong className="metric-value">{formatCount(databases.length)}</strong>
          <p className="metric-helper">{t('blastNew.availableDatabasesHelper')}</p>
        </article>
        <article className="card">
          <p className="metric-label">{t('blastNew.selectedDatabases')}</p>
          <strong className="metric-value">{formatCount(selected.length)}</strong>
          <p className="metric-helper">{t('blastNew.selectedDatabasesHelper')}</p>
        </article>
      </div>

      <div className="two-column">
        <article className="panel">
          <h3>{t('blastNew.taskParams')}</h3>
          <form className="form-stack" onSubmit={handleSubmit}>
            <label>
              <span>{isChinese ? 'BLAST 方法' : 'BLAST Method'}</span>
              <select value={method} onChange={(event) => setMethod(event.target.value as BlastMethod)}>
                {supportedMethods.map((item) => (
                  <option disabled={!availableMethods.includes(item)} key={item} value={item}>
                    {item} ({configuredMethods.find((entry) => entry.id === item)?.helper || (isChinese ? methodMeta[item].helperZh : methodMeta[item].helperEn)})
                  </option>
                ))}
              </select>
            </label>

            <div className="result-box">
              <h4>{t('blastNew.databaseSelection')}</h4>
              {loading || prefillLoading ? <p>{isChinese ? '加载中...' : 'Loading...'}</p> : null}
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
              <span>{t('blastNew.querySequence')}</span>
              <div className="toolbar">
                <div className="toolbar-group">
                  <span className="toolbar-note">
                    {t('blastNew.exampleSequence')}：
                    {currentQueryExample?.label || (isChinese ? '当前方法没有配置示例。' : 'No example is configured for the current method.')}
                  </span>
                </div>
                <div className="toolbar-group">
                  <button
                    className="secondary-button"
                    disabled={!currentQueryExample?.sequence}
                    onClick={handleUseExampleSequence}
                    type="button"
                  >
                    {t('blastNew.loadExample')}
                  </button>
                </div>
              </div>
              <textarea rows={10} value={sequence} onChange={(event) => handleSequenceChange(event.target.value)} />
              <span className="toolbar-note">{t('blastNew.exampleAutoSwitch')}</span>
            </label>

            <label>
              <span>{t('blastNew.advanced')}</span>
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
              <span>{t('blastNew.openInNewTab')}</span>
            </label>

            <ValidationMessage message={validationError || error} />

            <button className="primary-button" disabled={submitting || Boolean(validationError)} type="submit">
              {submitting ? t('blastNew.submitting') : t('blastNew.submit')}
            </button>
          </form>
        </article>

        <article className="panel">
          <h3>{t('blastNew.preview')}</h3>
          <div className="result-box">
            <h4>{t('blastNew.methodSummary')}</h4>
            <p>{isChinese ? '方法' : 'Method'}：{methodDetails.label}</p>
            <p>{isChinese ? 'Query 类型' : 'Query Type'}：{methodDetails.queryType}</p>
            <p>{isChinese ? '数据库类型' : 'Database Type'}：{methodDetails.databaseType}</p>
            <p>{methodDetails.helper || (isChinese ? methodMeta[method].helperZh : methodMeta[method].helperEn)}</p>
            <p>{isChinese ? '默认高级参数' : 'Default Advanced Parameters'}：{methodDetails.defaultAdvanced || '-'}</p>
          </div>

          <div className="result-box">
            <h4>{t('blastNew.databaseScope')}</h4>
            <div className="list">
              {selectedDatabases.map((database) => (
                <div className="list-item" key={database.id}>
                  <strong>{database.title}</strong>
                  <span>{isChinese ? '类型' : 'Type'}：{database.type}</span>
                  <code>{database.name}</code>
                </div>
              ))}
              {!selectedDatabases.length ? <p>{t('blastNew.noDatabasesSelected')}</p> : null}
            </div>
          </div>

          {job ? (
            <div className="result-box">
              <h4>{isChinese ? '任务已创建' : 'Job Created'}</h4>
              <p>{isChinese ? '任务 ID' : 'Job ID'}：{job.id}</p>
              <p>{isChinese ? '状态' : 'Status'}：{job.status}</p>
              <p>{isChinese ? '结果地址' : 'Result URL'}：{job.result_url || (isChinese ? '尚未生成' : 'Not generated yet')}</p>
              <p>
                {isChinese ? '详情页' : 'Detail Page'}：
                <Link to={`/jobs/blast/${job.id}`}> /jobs/blast/{job.id}</Link>
              </p>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  )
}
