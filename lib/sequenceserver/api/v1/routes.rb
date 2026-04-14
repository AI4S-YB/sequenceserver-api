require 'sequenceserver/api/v1/helpers'
require 'fileutils'
require 'digest/md5'

module SequenceServer
  module API
    module V1
      # API routes that expose a stable JSON contract for frontend clients.
      module Routes
        def self.registered(app)
          app.helpers SequenceServer::API::V1::Helpers

          app.before '/api/v1/*' do
            origin = cors_origin
            if origin
              response.headers['Access-Control-Allow-Origin'] = origin
              response.headers['Vary'] = 'Origin'
              response.headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'
              response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            end
          end

          app.options '/api/v1/*' do
            origin = cors_origin
            halt 403 unless origin

            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
            response.headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'
            response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            halt 204
          end

          app.get '/api/v1/databases' do
            json_response(Database.all.map { |database| serialize_database(database) })
          end

          app.get '/api/v1/frontend/blast_form' do
            json_response(serialize_blast_form_config)
          end

          app.get '/api/v1/sequences' do
            json_response(serialize_sequence_lookup_result(sequence_retriever))
          rescue SequenceServer::InvalidSequenceIdError => e
            json_error('invalid_sequence_id', sanitize_message(e.more_info || e.message), status: e.http_status)
          rescue SequenceServer::DatabaseUnreachableError => e
            json_error('database_unreachable', sanitize_message(e.more_info || e.message), status: e.http_status)
          end

          app.get '/api/v1/sequences/download' do
            sequences = sequence_retriever(in_file: true)
            send_file(sequences.file.path, type: sequences.mime, filename: sequences.filename)
          rescue SequenceServer::InvalidSequenceIdError => e
            json_error('invalid_sequence_id', sanitize_message(e.more_info || e.message), status: e.http_status)
          rescue SequenceServer::DatabaseUnreachableError => e
            json_error('database_unreachable', sanitize_message(e.more_info || e.message), status: e.http_status)
          end

          app.post '/api/v1/sequences/download' do
            sequences = sequence_retriever(in_file: true)
            send_file(sequences.file.path, type: sequences.mime, filename: sequences.filename)
          rescue SequenceServer::InvalidSequenceIdError => e
            json_error('invalid_sequence_id', sanitize_message(e.more_info || e.message), status: e.http_status)
          rescue SequenceServer::DatabaseUnreachableError => e
            json_error('database_unreachable', sanitize_message(e.more_info || e.message), status: e.http_status)
          end

          app.post '/api/v1/databases' do
            payload = database_create_payload
            sequence = payload[:sequence].to_s
            json_error('invalid_sequence', 'Sequence content is required.', status: 400) if sequence.strip.empty?

            path = database_file_path(payload[:name])
            FileUtils.mkdir_p(File.dirname(path))
            File.write(path, sequence)
            SequenceServer.makeblastdb.reset_scan_cache!

            title = payload[:title] || SequenceServer.makeblastdb.suggested_title(path)
            sequence_type = (payload[:type] || SequenceServer.makeblastdb.guess_sequence_type(path))&.to_s
            index_job = nil

            if truthy?(payload[:auto_index])
              json_error('invalid_database', 'Could not determine sequence type from FASTA content.', status: 400) unless sequence_type

              index_job = DatabaseIndexJob.new(
                database_id: Digest::MD5.hexdigest(path),
                path: path,
                title: title,
                sequence_type: sequence_type,
                taxid: payload[:taxid] || 0
              )
              Job.enqueue(index_job)
            end

            json_response(
              serialize_database_create_result(
                path: path,
                title: title,
                type: sequence_type,
                index_job: index_job
              ),
              status: 201
            )
          end

          app.post '/api/v1/databases/:id/index' do |id|
            payload = json_request_body
            path = resolve_database_path(id)
            json_error('not_found', 'Database file not found.', status: 404) unless path

            sequence_type = payload[:type]&.to_s || SequenceServer.makeblastdb.guess_sequence_type(path)&.to_s
            json_error('invalid_database', 'Could not determine sequence type from FASTA content.', status: 400) unless sequence_type

            job = DatabaseIndexJob.new(
              database_id: id,
              path: path,
              title: payload[:title] || SequenceServer.makeblastdb.suggested_title(path),
              sequence_type: sequence_type,
              taxid: payload[:taxid] || 0
            )
            Job.enqueue(job)

            json_response(serialize_job(job), status: 202)
          end

          app.delete '/api/v1/databases/:id' do |id|
            path = resolve_database_path(id)
            json_error('not_found', 'Database file not found.', status: 404) unless path

            active_jobs = active_database_jobs(id, path)
            if active_jobs.any?
              json_error('database_in_use', 'Database is still referenced by queued or running jobs.', status: 409)
            end

            json_response(delete_database_files!(path))
          end

          app.post '/api/v1/blast_jobs' do
            payload = json_request_body
            job = Job.create(payload)

            json_response(serialize_job(job), status: 202)
          rescue SequenceServer::InputError => e
            json_error('input_error', sanitize_message(e.more_info || e.message), status: e.http_status)
          rescue SequenceServer::APIError => e
            json_error('api_error', sanitize_message(e.message), status: e.http_status)
          end

          app.get '/api/v1/blast_jobs' do
            json_response(serialize_jobs(filtered_jobs(kind: 'blast')))
          end

          app.get '/api/v1/blast_jobs/:id' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'BLAST job not found.', status: 404) unless job

            json_response(serialize_job(job))
          end

          app.get '/api/v1/blast_jobs/:id/input' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'BLAST job not found.', status: 404) unless blast_job?(job)

            json_response(serialize_blast_job_input(job))
          end

          app.post '/api/v1/blast_jobs/:id/cancel' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'BLAST job not found.', status: 404) unless blast_job?(job)
            json_error('job_not_cancellable', 'Job has already finished.', status: 409) if job.done?

            cancelled = job.cancel!
            json_error('job_not_cancellable', 'Job is not running.', status: 409) unless cancelled

            json_response(serialize_job(job))
          end

          app.get '/api/v1/blast_jobs/:id/logs/:stream' do |id, stream|
            job = Job.fetch(id)
            json_error('not_found', 'BLAST job not found.', status: 404) unless blast_job?(job)
            json_error('invalid_log_stream', 'Log stream must be stdout or stderr.', status: 400) unless %w[stdout stderr].include?(stream)

            json_response(
              {
                id: job.id,
                stream: stream,
                content: job.log_content(stream)
              }
            )
          end

          app.get '/api/v1/blast_jobs/:id/result' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'BLAST job not found.', status: 404) unless job
            json_response(serialize_job(job), status: 202) unless job.done?

            report = BLAST::Report.new(job)
            json_response(serialize_job(job), status: 202) unless report.done?
            if display_large_result_warning_for_api?(report.xml_file_size)
              json_response(serialize_large_result_warning(job, xml_file_size: report.xml_file_size))
            end

            json_response(serialize_report(report))
          rescue SequenceServer::APIError => e
            json_error('result_unavailable', sanitize_message(e.more_info || e.message), status: e.http_status)
          end

          app.get '/api/v1/blast_jobs/:id/download/:type' do |id, type|
            job = Job.fetch(id)
            json_error('not_found', 'BLAST job not found.', status: 404) unless blast_job?(job)
            json_error('invalid_download_type', 'Unsupported BLAST download format.', status: 400) unless SequenceServer::BLAST::OUTFMT.key?(type)
            json_error('result_unavailable', 'BLAST result is not available until the job succeeds.', status: 409) unless blast_downloadable?(job)
            json_error('invalid_download_type', 'Unsupported BLAST download format for this job.', status: 400) unless blast_download_type?(job, type)

            if job.respond_to?(:imported_xml_file) && job.imported_xml_file && type == 'xml'
              send_file job.imported_xml_file, filename: 'sequenceserver-xml_report.xml', type: :xml
            else
              out = BLAST::Formatter.new(job, type)
              json_error('not_found', 'Download file not found.', status: 404) unless File.exist?(out.filepath)
              send_file out.filepath, filename: out.filename, type: out.mime
            end
          rescue SequenceServer::SystemError => e
            json_error('download_failed', sanitize_message(e.more_info || e.message), status: 500)
          end

          app.get '/api/v1/database_jobs/:id' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'Database job not found.', status: 404) unless job.is_a?(DatabaseIndexJob)

            json_response(serialize_job(job))
          end

          app.get '/api/v1/database_jobs' do
            json_response(serialize_jobs(filtered_jobs(kind: 'database_index')))
          end

          app.post '/api/v1/database_jobs/:id/cancel' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'Database job not found.', status: 404) unless job.is_a?(DatabaseIndexJob)
            json_error('job_not_cancellable', 'Job has already finished.', status: 409) if job.done?

            cancelled = job.cancel!
            json_error('job_not_cancellable', 'Job is not running.', status: 409) unless cancelled

            json_response(serialize_job(job))
          end

          app.get '/api/v1/database_jobs/:id/logs/:stream' do |id, stream|
            job = Job.fetch(id)
            json_error('not_found', 'Database job not found.', status: 404) unless job.is_a?(DatabaseIndexJob)
            json_error('invalid_log_stream', 'Log stream must be stdout or stderr.', status: 400) unless %w[stdout stderr].include?(stream)

            json_response(
              {
                id: job.id,
                stream: stream,
                content: job.log_content(stream)
              }
            )
          end

          app.get '/api/v1/database_jobs/:id/result' do |id|
            job = Job.fetch(id)
            json_error('not_found', 'Database job not found.', status: 404) unless job.is_a?(DatabaseIndexJob)
            json_response(serialize_job(job), status: 202) unless job.done?

            job.raise!
            json_response(serialize_index_result(job))
          rescue SequenceServer::APIError => e
            json_error('index_failed', sanitize_message(e.more_info || e.message), status: e.http_status)
          rescue SequenceServer::SystemError => e
            json_error('index_failed', sanitize_message(e.more_info || e.message), status: 500)
          end
        end
      end
    end
  end
end
