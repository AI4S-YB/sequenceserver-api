require 'pathname'
require 'digest/md5'
require 'rack/utils'
require 'rack/mime'
require 'fileutils'

module SequenceServer
  module API
    module V1
      # Shared JSON helpers for API endpoints.
      module Helpers
        BLAST_METHOD_METADATA = {
          'blastn' => {
            label: 'blastn',
            query_type: 'nucleotide',
            database_type: 'nucleotide',
            helper: '核酸 query 对核酸数据库'
          },
          'blastp' => {
            label: 'blastp',
            query_type: 'protein',
            database_type: 'protein',
            helper: '蛋白 query 对蛋白数据库'
          },
          'blastx' => {
            label: 'blastx',
            query_type: 'nucleotide',
            database_type: 'protein',
            helper: '核酸 query 翻译后对蛋白数据库'
          },
          'tblastn' => {
            label: 'tblastn',
            query_type: 'protein',
            database_type: 'nucleotide',
            helper: '蛋白 query 对核酸数据库翻译搜索'
          },
          'tblastx' => {
            label: 'tblastx',
            query_type: 'nucleotide',
            database_type: 'nucleotide',
            helper: '核酸 query 与核酸数据库双向翻译搜索'
          }
        }.freeze

        BLAST_QUERY_EXAMPLES = {
          'blastn' => {
            label: 'Arabidopsis thaliana mRNA',
            query_type: 'nucleotide',
            path: 'data/examples/blast-query/arabidopsis_mrna.fa'
          },
          'blastx' => {
            label: 'Arabidopsis thaliana mRNA',
            query_type: 'nucleotide',
            path: 'data/examples/blast-query/arabidopsis_mrna.fa'
          },
          'tblastx' => {
            label: 'Arabidopsis thaliana mRNA',
            query_type: 'nucleotide',
            path: 'data/examples/blast-query/arabidopsis_mrna.fa'
          },
          'blastp' => {
            label: 'Arabidopsis thaliana protein',
            query_type: 'protein',
            path: 'data/examples/blast-query/arabidopsis_protein.fa'
          },
          'tblastn' => {
            label: 'Arabidopsis thaliana protein',
            query_type: 'protein',
            path: 'data/examples/blast-query/arabidopsis_protein.fa'
          }
        }.freeze

        BLAST_DOWNLOAD_LABELS = {
          'pairwise' => 'Pairwise 文本',
          'qa' => 'Query anchored',
          'qa_no_identity' => 'Query anchored 无 identity',
          'fqa' => 'Flat query anchored',
          'fqa_no_identity' => 'Flat query anchored 无 identity',
          'xml' => 'XML',
          'std_tsv' => '标准 TSV',
          'full_tsv' => '完整 TSV',
          'custom_tsv' => '精简 TSV',
          'asn_text' => 'ASN.1 文本',
          'asn_binary' => 'ASN.1 二进制',
          'csv' => 'CSV',
          'archive' => 'BLAST Archive'
        }.freeze

        def json_request_body
          body = request.body.read.to_s
          return {} if body.strip.empty?

          JSON.parse(body, symbolize_names: true)
        rescue JSON::ParserError
          json_error('invalid_json', 'Request body must be valid JSON.', status: 400)
        end

        def json_response(data, status: 200)
          content_type :json
          halt status, { data: data }.to_json
        end

        def json_error(code, message, status: 422)
          content_type :json
          halt status, { error: { code: code, message: message } }.to_json
        end

        def serialize_database(database)
          database.to_h.merge(id: database.id)
        end

        def serialize_pending_database(path, title:, type:)
          {
            id: Digest::MD5.hexdigest(path),
            name: path,
            title: title,
            type: type,
            indexed: false
          }
        end

        def serialize_job(job)
          data = {
            id: job.id,
            kind: job_kind(job),
            status: job_status(job),
            submitted_at: job.submitted_at&.utc,
            started_at: job.started_at&.utc,
            completed_at: job.completed_at&.utc,
            method: blast_job?(job) ? job.method : nil,
            databases: serialize_job_databases(job),
            result_url: job_result_url(job),
            log_urls: job_log_urls(job)
          }

          data[:exitstatus] = job.exitstatus if job.done?
          data[:database_id] = job.database_id if job.respond_to?(:database_id)
          data[:title] = job.title if job.respond_to?(:title)
          data[:downloads] = serialize_blast_downloads(job) if blast_job?(job)
          data
        end

        def serialize_blast_job_input(job)
          json_error('not_found', 'BLAST job not found.', status: 404) unless blast_job?(job)
          json_error('input_unavailable', 'Imported XML jobs cannot be reopened as editable BLAST inputs.', status: 409) if job.respond_to?(:imported_xml_file) && job.imported_xml_file
          json_error('input_unavailable', 'Original query sequence is unavailable for this job.', status: 409) unless job.respond_to?(:qfile) && job.qfile && File.exist?(job.qfile)

          {
            id: job.id,
            sequence: File.read(job.qfile),
            method: job.method,
            advanced: job.advanced.to_s,
            databases: serialize_job_databases(job),
            database_ids: Array(job.databases).map { |database| database.respond_to?(:id) ? database.id : database },
            submitted_at: job.submitted_at&.utc
          }
        end

        def serialize_database_create_result(path:, title:, type:, index_job: nil)
          data = serialize_pending_database(path, title: title, type: type)
          data[:index_job] = serialize_job(index_job) if index_job
          data
        end

        def serialize_jobs(jobs)
          jobs.map { |job| serialize_job(job) }
        end

        def database_create_payload
          return upload_database_payload if upload_request?

          payload = json_request_body
          payload[:sequence] ||= import_sequence_from_source(payload[:source]) if payload[:source]
          payload[:name] ||= imported_database_name(payload[:source]) if payload[:source]
          payload
        end

        def sequence_lookup_payload
          return params if request.get?
          return json_request_body if request.media_type == 'application/json'

          params
        end

        def normalize_id_list(value)
          Array(value)
            .flat_map { |entry| entry.to_s.split(',') }
            .map(&:strip)
            .reject(&:empty?)
            .uniq
        end

        def sequence_lookup_params
          payload = sequence_lookup_payload
          sequence_ids = normalize_id_list(payload[:sequence_ids] || payload['sequence_ids'])
          database_ids = normalize_id_list(payload[:database_ids] || payload['database_ids'])

          json_error('invalid_sequence_ids', 'At least one sequence id is required.', status: 400) if sequence_ids.empty?
          json_error('invalid_database_ids', 'At least one database id is required.', status: 400) if database_ids.empty?

          {
            sequence_ids: sequence_ids,
            database_ids: database_ids
          }
        end

        def sequence_retriever(in_file: false)
          lookup = sequence_lookup_params
          Sequence::Retriever.new(lookup[:sequence_ids], lookup[:database_ids], in_file)
        end

        def serialize_sequence_lookup_result(retriever)
          payload = JSON.parse(retriever.to_json)

          {
            sequence_ids: retriever.sequence_ids,
            database_ids: retriever.database_ids,
            sequence_count: payload.fetch('sequences', []).length,
            sequences: payload.fetch('sequences', []).map do |sequence|
              sequence.merge('length' => sequence.fetch('value', '').length)
            end,
            error_msgs: payload.fetch('error_msgs', []).map do |heading, message|
              {
                title: heading,
                message: message
              }
            end
          }
        end

        def serialize_report(report)
          JSON.parse(report.to_json)
        end

        def serialize_blast_form_options
          SequenceServer.config[:options].each_with_object({}) do |(algorithm, option_sets), data|
            data[algorithm.to_s] = option_sets.each_with_object({}) do |(name, option_set), configs|
              configs[name.to_s] = {
                description: option_set[:description],
                attributes: Array(option_set[:attributes])
              }
            end
          end
        end

        def serialize_blast_form_methods
          SequenceServer::BLAST::Tasks::ALGORITHMS.map do |algorithm|
            metadata = BLAST_METHOD_METADATA.fetch(algorithm)
            option_sets = SequenceServer.config[:options][algorithm.to_sym] || {}
            default_attributes = Array(option_sets.dig(:default, :attributes))

            {
              id: algorithm,
              label: metadata[:label],
              query_type: metadata[:query_type],
              database_type: metadata[:database_type],
              helper: metadata[:helper],
              tasks: SequenceServer::BLAST::Tasks.to_h[algorithm] || [],
              default_attributes: default_attributes,
              default_advanced: default_attributes.join(' ')
            }
          end
        end

        def serialize_blast_form_config
          payload = {
            databases: Database.all.map { |database| serialize_database(database) },
            methods: serialize_blast_form_methods,
            options: serialize_blast_form_options,
            blast_task_map: SequenceServer::BLAST::Tasks.to_h,
            query_examples: serialize_blast_query_examples
          }

          payload[:database_tree] = Database.tree if SequenceServer.config[:databases_widget] == 'tree'
          payload
        end

        def serialize_blast_query_examples
          BLAST_QUERY_EXAMPLES.each_with_object({}) do |(method, metadata), memo|
            path = File.expand_path(File.join(settings.root, metadata[:path]))
            next unless File.file?(path)

            sequence = File.read(path).to_s.strip
            next if sequence.empty?

            memo[method] = {
              label: metadata[:label],
              query_type: metadata[:query_type],
              sequence: sequence
            }
          end
        end

        def large_result_warning_threshold
          SequenceServer.config[:large_result_warning_threshold].to_i
        end

        def display_large_result_warning_for_api?(xml_file_size)
          threshold = large_result_warning_threshold
          return false unless threshold.positive?
          return false if params[:bypass_file_size_warning] == 'true'

          xml_file_size > threshold
        end

        def serialize_large_result_warning(job, xml_file_size:)
          {
            user_warning: 'LARGE_RESULT',
            warning_code: 'LARGE_RESULT',
            message: 'BLAST 结果可能过大，浏览器直接加载时可能非常慢，甚至无响应。',
            detail: '建议优先下载结果到本地查看；如果你确认当前机器资源足够，也可以继续在浏览器中强制加载。',
            xml_file_size: xml_file_size,
            threshold: large_result_warning_threshold,
            bypass_parameter: 'bypass_file_size_warning',
            bypass_value: 'true',
            download_links: serialize_blast_downloads(job)
          }
        end

        def job_status(job)
          return 'cancelled' if job.respond_to?(:cancelled?) && job.cancelled?
          return 'running' if job.started_at && !job.done?
          return 'queued' unless job.done?

          job.exitstatus == 0 ? 'succeeded' : 'failed'
        end

        def job_kind(job)
          case job
          when SequenceServer::DatabaseIndexJob
            'database_index'
          else
            'blast'
          end
        end

        def job_result_url(job)
          return nil unless job.done? && job.exitstatus == 0

          case job
          when SequenceServer::DatabaseIndexJob
            "/api/v1/database_jobs/#{job.id}/result"
          else
            "/api/v1/blast_jobs/#{job.id}/result"
          end
        end

        def job_log_urls(job)
          base = case job
                 when SequenceServer::DatabaseIndexJob
                   "/api/v1/database_jobs/#{job.id}/logs"
                 else
                   "/api/v1/blast_jobs/#{job.id}/logs"
                 end

          {
            stdout: "#{base}/stdout",
            stderr: "#{base}/stderr"
          }
        end

        def serialize_job_databases(job)
          return [] unless blast_job?(job)

          Array(job.databases).map do |database|
            database.respond_to?(:id) ? serialize_database(database) : database
          end
        end

        def blast_job?(job)
          job.is_a?(SequenceServer::BLAST::Job)
        end

        def blast_downloadable?(job)
          blast_job?(job) && job.done? && job.exitstatus == 0
        end

        def blast_download_formats(job)
          return [] unless blast_downloadable?(job)

          if job.respond_to?(:imported_xml_file) && job.imported_xml_file
            ['xml']
          else
            SequenceServer::BLAST::OUTFMT.keys
          end
        end

        def blast_download_type?(job, type)
          blast_download_formats(job).include?(type.to_s)
        end

        def serialize_blast_downloads(job)
          blast_download_formats(job).map do |type|
            _format, extension, = SequenceServer::BLAST::OUTFMT.fetch(type)

            {
              type: type,
              label: BLAST_DOWNLOAD_LABELS[type] || type,
              url: "/api/v1/blast_jobs/#{job.id}/download/#{type}",
              extension: extension.to_s,
              mime: Rack::Mime.mime_type(".#{extension}", 'application/octet-stream')
            }
          end
        end

        def sanitize_message(message)
          message.to_s.gsub(/\s+/, ' ').strip
        end

        def cors_origin
          origin = request.env['HTTP_ORIGIN'].to_s
          return nil if origin.empty?

          allowed_origins = Array(SequenceServer.config[:allowed_origins]).map(&:to_s)
          return '*' if allowed_origins.include?('*')
          return origin if allowed_origins.include?(origin)

          nil
        end

        def import_sequence_from_source(source)
          SequenceServer::DatabaseImporter.new(source).read
        rescue SequenceServer::APIError => e
          json_error('import_error', sanitize_message(e.more_info || e.message), status: e.http_status)
        rescue StandardError => e
          json_error('import_error', sanitize_message(e.message), status: 400)
        end

        def imported_database_name(source)
          name = SequenceServer::DatabaseImporter.new(source).default_name
          json_error('invalid_database_name', 'Database file name is required for this source.', status: 400) if name.to_s.strip.empty?

          name
        end

        def filtered_jobs(kind:)
          jobs = SequenceServer::Job.all.compact.select { |job| job_kind(job) == kind }
          jobs = jobs.select { |job| job_status(job) == params[:status] } if params[:status]

          jobs
            .sort_by { |job| job.submitted_at || Time.at(0) }
            .reverse
            .first(request_limit || jobs.length)
        end

        def request_limit
          return nil unless params[:limit]

          limit = Integer(params[:limit])
          json_error('invalid_limit', 'limit must be a positive integer.', status: 400) unless limit.positive?

          limit
        rescue ArgumentError
          json_error('invalid_limit', 'limit must be a positive integer.', status: 400)
        end

        def multipart_request?
          request.media_type == 'multipart/form-data'
        end

        def upload_request?
          multipart_request? || request.media_type == 'application/x-www-form-urlencoded'
        end

        def upload_database_payload
          upload = params[:file]
          json_error('invalid_file', 'FASTA file upload is required.', status: 400) unless upload.is_a?(Hash)

          tempfile = upload[:tempfile]
          json_error('invalid_file', 'Uploaded FASTA file could not be read.', status: 400) unless tempfile

          sequence = tempfile.read.to_s
          tempfile.rewind

          {
            name: params[:name].to_s.strip.empty? ? upload_filename(upload) : params[:name],
            sequence: sequence,
            title: blank_to_nil(params[:title]),
            type: blank_to_nil(params[:type])
          }
        end

        def upload_filename(upload)
          filename = upload[:filename].to_s
          json_error('invalid_database_name', 'Database file name is required.', status: 400) if filename.strip.empty?

          Rack::Utils.unescape_path(filename).split(/[\\\/]/).last
        end

        def blank_to_nil(value)
          text = value.to_s.strip
          text.empty? ? nil : text
        end

        def truthy?(value)
          [true, 'true', 1, '1', 'yes', 'on'].include?(value)
        end

        def database_file_path(name)
          candidate = Pathname.new(name.to_s)
          json_error('invalid_database_name', 'Database file name is required.', status: 400) if candidate.to_s.strip.empty?
          json_error('invalid_database_name', 'Database file name must be relative.', status: 400) if candidate.absolute?

          clean = candidate.cleanpath
          clean_parts = clean.each_filename.to_a
          if clean_parts.empty? || clean_parts.include?('..')
            json_error('invalid_database_name', 'Database file name must stay within the configured database directory.', status: 400)
          end

          File.join(SequenceServer.config[:database_dir], clean.to_s)
        end

        def resolve_database_path(id)
          database = find_database(id)
          return database.path if database

          SequenceServer.makeblastdb.fasta_path_for(id)
        end

        def database_deletion_targets(path)
          expanded_path = expanded_database_path(path)
          expanded_root = File.expand_path(SequenceServer.config[:database_dir].to_s)

          json_error('invalid_database_path', 'Database path is outside the configured database directory.', status: 400) unless expanded_path.start_with?("#{expanded_root}/") || expanded_path == expanded_root

          [expanded_path, *Dir["#{expanded_path}.*"]].uniq.select { |entry| File.exist?(entry) }
        end

        def active_database_jobs(id, path)
          SequenceServer::Job.all.compact.select do |job|
            next false if job.done?

            if blast_job?(job)
              Array(job.databases).any? do |database|
                database_id = database.respond_to?(:id) ? database.id : database
                database_id == id
              end
            elsif job.is_a?(SequenceServer::DatabaseIndexJob)
              job.database_id == id || expanded_database_path(job.path) == expanded_database_path(path)
            else
              false
            end
          end
        end

        def delete_database_files!(path)
          targets = database_deletion_targets(path)
          json_error('not_found', 'Database file not found.', status: 404) if targets.empty?

          FileUtils.rm_f(targets)
          SequenceServer.refresh_databases!

          {
            id: Digest::MD5.hexdigest(path),
            name: path,
            deleted: true,
            removed_files: targets.map { |entry| File.basename(entry) }
          }
        end

        def expanded_database_path(path)
          candidate = Pathname.new(path.to_s)
          if candidate.absolute?
            File.expand_path(candidate.to_s)
          else
            File.expand_path(candidate.to_s, SequenceServer.config[:database_dir].to_s)
          end
        end

        def serialize_index_result(job)
          database = find_database(job.database_id) || Database.all.find { |entry| entry.path == job.path }
          json_error('not_found', 'Indexed database could not be found after job completion.', status: 404) unless database

          serialize_database(database).merge(indexed: true)
        end

        def find_database(id)
          result = Database[id]
          return result.first if result.is_a?(Array)

          result
        end
      end
    end
  end
end
