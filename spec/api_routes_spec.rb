require 'spec_helper'

require 'json'
require 'rack/test'
require 'tempfile'

module SequenceServer
  RSpec.describe 'API routes' do
    include Rack::Test::Methods

    before do
      allow(SequenceServer).to receive(:assert_blast_installed_and_compatible).and_return(true)
      SequenceServer.init(database_dir: "#{__dir__}/database/v5/sample")
    end

    let 'app' do
      SequenceServer
    end

    describe 'GET /api' do
      it 'redirects to the Swagger UI entry' do
        get '/api'

        expect(last_response.status).to eq(302)
        expect(last_response.headers['Location']).to end_with('/api/docs')
      end
    end

    describe 'GET /api/openapi.json' do
      it 'returns the OpenAPI document' do
        get '/api/openapi.json'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('application/json')

        payload = JSON.parse(last_response.body)
        expect(payload['openapi']).to eq('3.1.0')
        expect(payload.fetch('paths')).to include(
          '/api/v1/databases',
          '/api/v1/blast_jobs',
          '/api/v1/database_jobs'
        )
      end
    end

    describe 'GET /api/docs' do
      it 'returns the Swagger UI page' do
        get '/api/docs'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('text/html')
        expect(last_response.body).to include('SwaggerUIBundle')
        expect(last_response.body).to include('/api/openapi.json')
      end
    end

    describe 'GET /api/v1/databases' do
      it 'returns the configured BLAST databases as JSON' do
        get '/api/v1/databases'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('application/json')

        payload = json_body
        expect(payload).to include('data')
        expect(payload['data']).to be_an(Array)
        expect(payload['data']).to_not be_empty
        expect(payload['data'].first).to include(
          'id',
          'name',
          'title',
          'type',
          'nsequences',
          'ncharacters',
          'updated_on',
          'format',
          'categories'
        )
      end
    end

    describe 'GET /api/v1/frontend/blast_form' do
      it 'returns BLAST form metadata for the new frontend' do
        get '/api/v1/frontend/blast_form'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('application/json')

        payload = json_body.fetch('data')
        expect(payload.fetch('databases')).to be_an(Array)
        expect(payload.fetch('methods')).to include(
          include(
            'id' => 'blastn',
            'query_type' => 'nucleotide',
            'database_type' => 'nucleotide'
          )
        )
        expect(payload.fetch('blast_task_map')).to include('blastn')
        expect(payload.fetch('options')).to include('blastn')
        expect(payload.fetch('query_examples')).to include(
          'blastn' => include(
            'label' => 'Arabidopsis thaliana mRNA',
            'query_type' => 'nucleotide'
          ),
          'blastp' => include(
            'label' => 'Arabidopsis thaliana protein',
            'query_type' => 'protein'
          )
        )
      end
    end

    describe 'GET /api/v1/sequences' do
      it 'returns retrieved sequences as JSON' do
        database_id = Database.first.id
        retriever = instance_double(
          SequenceServer::Sequence::Retriever,
          sequence_ids: ['seq1'],
          database_ids: [database_id],
          to_json: JSON.dump(
            error_msgs: [['WARNING', 'Partial match only']],
            sequences: [{ id: 'seq1', title: 'Example sequence', value: 'ACTG' }]
          )
        )
        allow(SequenceServer::Sequence::Retriever).to receive(:new).with(['seq1'], [database_id], false).and_return(retriever)

        get "/api/v1/sequences?sequence_ids=seq1&database_ids=#{database_id}"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'sequence_ids' => ['seq1'],
          'database_ids' => [database_id],
          'sequence_count' => 1
        )
        expect(json_body.fetch('data').fetch('sequences')).to include(
          include(
            'id' => 'seq1',
            'title' => 'Example sequence',
            'value' => 'ACTG',
            'length' => 4
          )
        )
        expect(json_body.fetch('data').fetch('error_msgs')).to include(
          include(
            'title' => 'WARNING',
            'message' => 'Partial match only'
          )
        )
      end

      it 'returns 400 when sequence ids are missing' do
        get "/api/v1/sequences?database_ids=#{Database.first.id}"

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('invalid_sequence_ids')
      end

      it 'maps invalid sequence id errors to a JSON API response' do
        allow(SequenceServer::Sequence::Retriever).to receive(:new)
          .and_raise(SequenceServer::InvalidSequenceIdError.new('Invalid sequence id(s): invalid_sequence_id'))

        get "/api/v1/sequences?sequence_ids=invalid_sequence_id';sleep%2030;&database_ids=#{Database.first.id}"

        expect(last_response.status).to eq(422)
        expect(json_body.fetch('error')).to include(
          'code' => 'invalid_sequence_id',
          'message' => 'Invalid sequence id(s): invalid_sequence_id'
        )
      end
    end

    describe 'GET /api/v1/sequences/download' do
      it 'downloads FASTA from the API route' do
        database_id = Database.first.id
        tempfile = Tempfile.new(['api-sequences', '.fa'])
        tempfile.write(">seq1 Example sequence\nACTG\n")
        tempfile.flush

        retriever = double(
          'SequenceRetrieverDownload',
          file: tempfile,
          mime: :fasta,
          filename: 'sequenceserver-seq1.fa'
        )
        allow(SequenceServer::Sequence::Retriever).to receive(:new).with(['seq1'], [database_id], true).and_return(retriever)

        get "/api/v1/sequences/download?sequence_ids=seq1&database_ids=#{database_id}"

        expect(last_response.status).to eq(200)
        expect(last_response.headers['Content-Type']).to include('fasta')
        expect(last_response.headers['Content-Disposition']).to include('sequenceserver-seq1.fa')
        expect(last_response.body).to include('>seq1 Example sequence')
      ensure
        tempfile.close!
      end
    end

    describe 'POST /api/v1/sequences/download' do
      it 'accepts JSON payloads for FASTA download' do
        database_id = Database.first.id
        tempfile = Tempfile.new(['api-sequences-post', '.fa'])
        tempfile.write(">seq1 Example sequence\nACTG\n")
        tempfile.flush

        retriever = double(
          'SequenceRetrieverDownload',
          file: tempfile,
          mime: :fasta,
          filename: 'sequenceserver-seq1.fa'
        )
        allow(SequenceServer::Sequence::Retriever).to receive(:new).with(['seq1', 'seq2'], [database_id], true).and_return(retriever)

        post '/api/v1/sequences/download',
             JSON.dump(sequence_ids: %w[seq1 seq2], database_ids: [database_id]),
             'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(200)
        expect(last_response.headers['Content-Disposition']).to include('sequenceserver-seq1.fa')
      ensure
        tempfile.close!
      end
    end

    describe 'POST /api/v1/blast_jobs' do
      let(:payload) do
        {
          sequence: '>query_1
ACTGACTGACTG',
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        }
      end

      it 'creates a job and returns queued job metadata' do
        post '/api/v1/blast_jobs', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(202)
        expect(last_response.content_type).to include('application/json')

        body = json_body.fetch('data')
        expect(body['id']).to be_a(String)
        expect(body['status']).to eq('queued')
        expect(body['method']).to eq(payload[:method])
        expect(body['databases']).to be_an(Array)
        expect(body['databases'].first['id']).to eq(Database.first.id)
        expect(body['result_url']).to be_nil
        expect(body['log_urls']).to include('stdout', 'stderr')
      end

      it 'returns 400 for invalid JSON' do
        post '/api/v1/blast_jobs', '{not-json', 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(400)
        expect(json_body).to eq(
          'error' => {
            'code' => 'invalid_json',
            'message' => 'Request body must be valid JSON.'
          }
        )
      end

      it 'returns 400 for invalid job input' do
        invalid_payload = payload.merge(method: 'not_a_blast_method')
        post '/api/v1/blast_jobs', JSON.dump(invalid_payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('input_error')
      end
    end

    describe 'POST /api/v1/databases' do
      let(:database_dir) { File.join(__dir__, 'tmp', 'api_databases') }

      before do
        FileUtils.rm_rf(database_dir)
        FileUtils.mkdir_p(database_dir)
        FileUtils.cp_r(File.join(__dir__, 'database', 'v5', 'sample', '.'), database_dir)
        SequenceServer.init(database_dir: database_dir)
        SequenceServer.config[:allowed_import_paths] = []
        SequenceServer.config[:allowed_import_urls] = []
        SequenceServer.config[:allowed_s3_buckets] = []
      end

      after do
        FileUtils.rm_rf(database_dir)
      end

      it 'stores a FASTA file in the configured database directory' do
        payload = {
          name: 'uploads/example.fa',
          sequence: ">seq1\nACTGACTGACTG"
        }

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(201)
        expect(File.exist?(File.join(database_dir, 'uploads', 'example.fa'))).to be(true)
        expect(json_body.fetch('data')).to include(
          'title' => 'example',
          'type' => 'nucleotide',
          'indexed' => false
        )
      end

      it 'rejects unsafe relative paths' do
        payload = {
          name: '../escape.fa',
          sequence: ">seq1\nACTGACTGACTG"
        }

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('invalid_database_name')
      end

      it 'stores an uploaded FASTA file from multipart form-data' do
        upload = Tempfile.new(['uploaded', '.fa'])
        upload.write(">seq1\nACTGACTGACTG")
        upload.rewind

        post '/api/v1/databases',
             {
               file: Rack::Test::UploadedFile.new(upload.path, 'text/plain', original_filename: 'from_upload.fa'),
               title: 'Uploaded Via Form'
             }

        expect(last_response.status).to eq(201)
        expect(File.exist?(File.join(database_dir, 'from_upload.fa'))).to be(true)
        expect(json_body.fetch('data')).to include(
          'title' => 'Uploaded Via Form',
          'type' => 'nucleotide',
          'indexed' => false
        )
      ensure
        upload.close!
      end

      it 'returns 400 when multipart upload omits the file' do
        post '/api/v1/databases', { title: 'Missing File' }

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('invalid_file')
      end

      it 'imports FASTA content from a local path source' do
        source_path = File.join(__dir__, 'tmp', 'source_local.fa')
        FileUtils.mkdir_p(File.dirname(source_path))
        File.write(source_path, ">seq1\nACTGACTGACTG")
        SequenceServer.config[:allowed_import_paths] = [File.dirname(source_path)]

        payload = {
          source: {
            type: 'local_path',
            path: source_path
          },
          name: 'imports/from_path.fa',
          title: 'Imported From Path'
        }

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(201)
        expect(File.exist?(File.join(database_dir, 'imports', 'from_path.fa'))).to be(true)
        expect(json_body.fetch('data')).to include(
          'title' => 'Imported From Path',
          'indexed' => false
        )
      end

      it 'rejects local path imports when the path is not allowed by policy' do
        source_path = File.join(__dir__, 'tmp', 'disallowed_source.fa')
        FileUtils.mkdir_p(File.dirname(source_path))
        File.write(source_path, ">seq1\nACTGACTGACTG")

        payload = {
          source: {
            type: 'local_path',
            path: source_path
          },
          name: 'imports/from_path.fa'
        }

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('import_error')
      end

      it 'allows local path imports when the path prefix is configured' do
        source_path = File.join(__dir__, 'tmp', 'allowed_source.fa')
        FileUtils.mkdir_p(File.dirname(source_path))
        File.write(source_path, ">seq1\nACTGACTGACTG")
        SequenceServer.config[:allowed_import_paths] = [File.dirname(source_path)]

        payload = {
          source: {
            type: 'local_path',
            path: source_path
          },
          name: 'imports/allowed_path.fa'
        }

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(201)
        expect(File.exist?(File.join(database_dir, 'imports', 'allowed_path.fa'))).to be(true)
      end

      it 'imports FASTA content from an s3 source and auto-indexes it' do
        payload = {
          source: {
            type: 's3',
            uri: 'https://example.com/presigned.fa'
          },
          name: 'imports/from_s3.fa',
          title: 'Imported From S3',
          auto_index: true
        }

        importer = instance_double(SequenceServer::DatabaseImporter, read: ">seq1\nACTGACTGACTG")
        allow(SequenceServer::DatabaseImporter).to receive(:new).with(hash_including(type: 's3', uri: 'https://example.com/presigned.fa')).and_return(importer)
        allow(SequenceServer.makeblastdb).to receive(:guess_sequence_type).and_return(:nucleotide)
        allow(SequenceServer::Job).to receive(:enqueue) { |job| job }

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(201)
        expect(json_body.fetch('data')).to include(
          'title' => 'Imported From S3',
          'type' => 'nucleotide',
          'indexed' => false
        )
        expect(json_body.fetch('data').fetch('index_job')).to include(
          'kind' => 'database_index',
          'status' => 'queued'
        )
      end

      it 'rejects remote imports when the source URL is not allowed by policy' do
        payload = {
          source: {
            type: 's3',
            uri: 'https://example.com/presigned.fa'
          },
          name: 'imports/disallowed_remote.fa'
        }

        importer = SequenceServer::DatabaseImporter.new(payload[:source])
        allow(SequenceServer::DatabaseImporter).to receive(:new).with(hash_including(type: 's3', uri: 'https://example.com/presigned.fa')).and_return(importer)

        post '/api/v1/databases', JSON.dump(payload), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('import_error')
      end
    end

    describe 'POST /api/v1/databases/:id/index' do
      let(:database_dir) { File.join(__dir__, 'tmp', 'api_indexing') }
      let(:path) { File.join(database_dir, 'uploads', 'to_index.fa') }
      let(:database_id) { Digest::MD5.hexdigest(path) }

      before do
        FileUtils.rm_rf(database_dir)
        FileUtils.mkdir_p(File.dirname(path))
        FileUtils.cp_r(File.join(__dir__, 'database', 'v5', 'sample', '.'), database_dir)
        File.write(path, ">seq1\nACTGACTGACTG")
        SequenceServer.init(database_dir: database_dir)
      end

      after do
        FileUtils.rm_rf(database_dir)
      end

      it 'enqueues a database indexing job and returns job metadata' do
        allow(SequenceServer.makeblastdb).to receive(:guess_sequence_type).and_return(:nucleotide)
        allow(SequenceServer::Job).to receive(:enqueue) { |job| job }

        post "/api/v1/databases/#{database_id}/index", JSON.dump(title: 'Uploaded Api Db'), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(202)
        expect(json_body.fetch('data')).to include(
          'kind' => 'database_index',
          'database_id' => database_id,
          'title' => 'Uploaded Api Db',
          'status' => 'queued'
        )
      end

      it 'returns 404 for an unknown pending FASTA' do
        post '/api/v1/databases/does-not-exist/index', JSON.dump({}), 'CONTENT_TYPE' => 'application/json'

        expect(last_response.status).to eq(404)
        expect(json_body.fetch('error').fetch('code')).to eq('not_found')
      end
    end

    describe 'DELETE /api/v1/databases/:id' do
      let(:database_dir) { File.join(__dir__, 'tmp', 'api_delete') }
      let(:database) { Database.first }
      let(:path) { database.name }
      let(:database_id) { database.id }

      before do
        FileUtils.rm_rf(database_dir)
        FileUtils.mkdir_p(database_dir)
        FileUtils.cp_r(File.join(__dir__, 'database', 'v5', 'sample', '.'), database_dir)
        SequenceServer.init(database_dir: database_dir)
        SequenceServer.refresh_databases!
      end

      after do
        FileUtils.rm_rf(database_dir)
      end

      it 'deletes a formatted database and its index files' do
        allow(SequenceServer::Job).to receive(:all).and_return([])

        delete "/api/v1/databases/#{database_id}"

        expect(last_response.status).to eq(200)
        expect(File.exist?(path)).to be(false)
        expect(Dir["#{path}.*"]).to be_empty
        expect(json_body.fetch('data')).to include(
          'id' => database_id,
          'deleted' => true
        )
      end

      it 'returns 404 for an unknown database' do
        allow(SequenceServer::Job).to receive(:all).and_return([])

        delete '/api/v1/databases/does-not-exist'

        expect(last_response.status).to eq(404)
        expect(json_body.fetch('error').fetch('code')).to eq('not_found')
      end

      it 'returns 409 when queued or running jobs still reference the database' do
        job = SequenceServer::DatabaseIndexJob.new(
          database_id: database_id,
          path: path,
          title: 'To Delete',
          sequence_type: 'nucleotide',
          taxid: 0
        )
        allow(SequenceServer::Job).to receive(:all).and_return([job])

        delete "/api/v1/databases/#{database_id}"

        expect(last_response.status).to eq(409)
        expect(json_body.fetch('error').fetch('code')).to eq('database_in_use')
      end
    end

    describe 'GET /api/v1/database_jobs/:id' do
      it 'returns database indexing job state' do
        job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-id',
          path: '/tmp/test.fa',
          title: 'Indexed Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )

        get "/api/v1/database_jobs/#{job.id}"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'kind' => 'database_index',
          'status' => 'queued'
        )
        expect(json_body.fetch('data').fetch('log_urls')).to include('stdout', 'stderr')
      end
    end

    describe 'GET /api/v1/database_jobs' do
      it 'lists database indexing jobs in reverse submission order' do
        older_job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-older',
          path: '/tmp/older.fa',
          title: 'Older Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )
        newer_job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-newer',
          path: '/tmp/newer.fa',
          title: 'Newer Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )

        get '/api/v1/database_jobs'

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data').map { |entry| entry['id'] }).to include(newer_job.id, older_job.id)
        expect(json_body.fetch('data').index { |entry| entry['id'] == newer_job.id })
          .to be < json_body.fetch('data').index { |entry| entry['id'] == older_job.id }
      end

      it 'filters database indexing jobs by status and limit' do
        queued_job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-queued',
          path: '/tmp/queued.fa',
          title: 'Queued Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )
        done_job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-done',
          path: '/tmp/done.fa',
          title: 'Done Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )
        allow(done_job).to receive(:done?).and_return(true)
        allow(done_job).to receive(:exitstatus).and_return(0)

        allow(SequenceServer::Job).to receive(:all).and_return([queued_job, done_job])

        get '/api/v1/database_jobs?status=succeeded&limit=1'

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data').length).to eq(1)
        expect(json_body.fetch('data').first).to include(
          'id' => done_job.id,
          'status' => 'succeeded'
        )
      end
    end

    describe 'POST /api/v1/database_jobs/:id/cancel' do
      it 'returns 409 for a completed database indexing job' do
        job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-id',
          path: '/tmp/test.fa',
          title: 'Indexed Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )

        allow(SequenceServer::Job).to receive(:fetch).with(job.id).and_return(job)
        allow(job).to receive(:done?).and_return(true)

        post "/api/v1/database_jobs/#{job.id}/cancel"

        expect(last_response.status).to eq(409)
        expect(json_body.fetch('error').fetch('code')).to eq('job_not_cancellable')
      end
    end

    describe 'GET /api/v1/database_jobs/:id/logs/:stream' do
      it 'returns requested database job log content' do
        job = SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-id',
          path: '/tmp/test.fa',
          title: 'Indexed Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )
        File.write(job.stderr, "index warning\n")

        get "/api/v1/database_jobs/#{job.id}/logs/stderr"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'stream' => 'stderr',
          'content' => "index warning\n"
        )
      end
    end

    describe 'GET /api/v1/database_jobs/:id/result' do
      let(:job) do
        SequenceServer::DatabaseIndexJob.new(
          database_id: 'db-id',
          path: '/tmp/test.fa',
          title: 'Indexed Db',
          sequence_type: 'nucleotide',
          taxid: 0
        )
      end

      it 'returns 202 while the indexing job is still queued' do
        get "/api/v1/database_jobs/#{job.id}/result"

        expect(last_response.status).to eq(202)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'status' => 'queued'
        )
      end

      it 'returns indexed database metadata once the job is complete' do
        indexed_database = SequenceServer::Database.new(
          '/tmp/test.fa',
          'Indexed Db',
          'nucleotide',
          1,
          12,
          '2026-04-12',
          '5',
          ['uploads']
        )

        allow(SequenceServer::Job).to receive(:fetch).with(job.id).and_return(job)
        allow(job).to receive(:done?).and_return(true)
        allow(job).to receive(:exitstatus).and_return(0)
        allow(job).to receive(:raise!).and_return(true)
        allow(SequenceServer::Database).to receive(:[]).with('db-id').and_return(indexed_database)

        get "/api/v1/database_jobs/#{job.id}/result"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => indexed_database.id,
          'title' => 'Indexed Db',
          'indexed' => true
        )
      end
    end

    describe 'GET /api/v1/blast_jobs/:id' do
      it 'returns job state for an existing job' do
        job = SequenceServer::BLAST::Job.new(
          sequence: '>query_1
ACTGACTGACTG',
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )

        get "/api/v1/blast_jobs/#{job.id}"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'status' => 'queued',
          'downloads' => []
        )
      end

      it 'returns 404 for an unknown job' do
        get '/api/v1/blast_jobs/does-not-exist'

        expect(last_response.status).to eq(404)
        expect(json_body).to eq(
          'error' => {
            'code' => 'not_found',
            'message' => 'BLAST job not found.'
          }
        )
      end
    end

    describe 'GET /api/v1/blast_jobs/:id/input' do
      it 'returns editable BLAST input for an existing job' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">query_1\nACTGACTGACTG",
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )

        get "/api/v1/blast_jobs/#{job.id}/input"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'sequence' => ">query_1\nACTGACTGACTG",
          'method' => job.method,
          'advanced' => '',
          'database_ids' => [Database.first.id]
        )
      end

      it 'returns 409 when job input cannot be reconstructed' do
        tempfile = Tempfile.new(['imported-report', '.xml'])
        tempfile.write('<BlastOutput></BlastOutput>')
        tempfile.flush
        xml_job = SequenceServer::BLAST::Job.new(xml: tempfile.path)

        get "/api/v1/blast_jobs/#{xml_job.id}/input"

        expect(last_response.status).to eq(409)
        expect(json_body.fetch('error')).to include(
          'code' => 'input_unavailable'
        )
      ensure
        tempfile.close!
      end
    end

    describe 'GET /api/v1/blast_jobs' do
      it 'lists BLAST jobs and rejects invalid limit values' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">query_1\nACTGACTGACTG",
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )

        get '/api/v1/blast_jobs?limit=1'

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data').first).to include('id' => job.id, 'kind' => 'blast')

        get '/api/v1/blast_jobs?limit=0'

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('invalid_limit')
      end
    end

    describe 'POST /api/v1/blast_jobs/:id/cancel' do
      it 'cancels a running BLAST job' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">query_1\nACTGACTGACTG",
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )

        allow(SequenceServer::Job).to receive(:fetch).with(job.id).and_return(job)
        allow(job).to receive(:done?).and_return(false)
        allow(job).to receive(:cancel!).and_return(true)
        allow(job).to receive(:cancelled?).and_return(true)

        post "/api/v1/blast_jobs/#{job.id}/cancel"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'status' => 'cancelled'
        )
      end
    end

    describe 'GET /api/v1/blast_jobs/:id/logs/:stream' do
      it 'returns requested BLAST job log content' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">query_1\nACTGACTGACTG",
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )
        File.write(job.stdout, "blast archive bytes\n")

        get "/api/v1/blast_jobs/#{job.id}/logs/stdout"

        expect(last_response.status).to eq(200)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'stream' => 'stdout',
          'content' => "blast archive bytes\n"
        )
      end
    end

    describe 'GET /api/v1/blast_jobs/:id/result' do
      let(:fixture_job_id) { '38334a72-e8e7-4732-872b-24d3f8723563' }
      let(:fixture_source_dir) { File.join(__dir__, 'fixtures', fixture_job_id) }
      let(:fixture_job_dir) { File.join(SequenceServer::DOTDIR, fixture_job_id) }

      before do
        FileUtils.mkdir_p(SequenceServer::DOTDIR)
        FileUtils.rm_r(fixture_job_dir) if File.exist?(fixture_job_dir)
        FileUtils.cp_r(fixture_source_dir, SequenceServer::DOTDIR)
        FileUtils.cp(
          File.join(fixture_job_dir, 'expected_outputs', 'sequenceserver-xml_report.xml'),
          File.join(fixture_job_dir, 'sequenceserver-xml_report.xml')
        )
        FileUtils.cp(
          File.join(fixture_job_dir, 'expected_outputs', 'sequenceserver-custom_tsv_report.tsv'),
          File.join(fixture_job_dir, 'sequenceserver-custom_tsv_report.tsv')
        )

        root_dir = File.expand_path(File.join(__dir__, '..'))
        Dir[File.join(fixture_job_dir, '**', '*')].each do |path|
          next unless File.file?(path)

          File.write(path, File.read(path).gsub('$PATH_PREFIX', root_dir))
        end
      end

      it 'returns 202 when the job is not done yet' do
        job = SequenceServer::BLAST::Job.new(
          sequence: '>query_1
ACTGACTGACTG',
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )

        get "/api/v1/blast_jobs/#{job.id}/result"

        expect(last_response.status).to eq(202)
        expect(json_body.fetch('data')).to include(
          'id' => job.id,
          'status' => 'queued'
        )
      end

      it 'returns parsed BLAST output for a completed job' do
        get "/api/v1/blast_jobs/#{fixture_job_id}/result"

        expect(last_response.status).to eq(200)
        body = json_body.fetch('data')
        expect(body).to include(
          'search_id' => fixture_job_id,
          'program' => 'blastn'
        )
        expect(body.fetch('queries')).to be_an(Array)
      end

      it 'returns a large-result warning payload when the XML exceeds the threshold' do
        original_threshold = SequenceServer.config[:large_result_warning_threshold]
        SequenceServer.config[:large_result_warning_threshold] = 1

        get "/api/v1/blast_jobs/#{fixture_job_id}/result"

        expect(last_response.status).to eq(200)
        body = json_body.fetch('data')
        expect(body).to include(
          'user_warning' => 'LARGE_RESULT',
          'warning_code' => 'LARGE_RESULT',
          'bypass_parameter' => 'bypass_file_size_warning',
          'bypass_value' => 'true'
        )
        expect(body.fetch('download_links')).to include(
          include(
            'type' => 'xml',
            'url' => "/api/v1/blast_jobs/#{fixture_job_id}/download/xml"
          )
        )
      ensure
        SequenceServer.config[:large_result_warning_threshold] = original_threshold
      end

      it 'allows bypassing the large-result warning explicitly' do
        original_threshold = SequenceServer.config[:large_result_warning_threshold]
        SequenceServer.config[:large_result_warning_threshold] = 1

        get "/api/v1/blast_jobs/#{fixture_job_id}/result?bypass_file_size_warning=true"

        expect(last_response.status).to eq(200)
        body = json_body.fetch('data')
        expect(body).to include(
          'search_id' => fixture_job_id,
          'program' => 'blastn'
        )
        expect(body).not_to include('user_warning')
      ensure
        SequenceServer.config[:large_result_warning_threshold] = original_threshold
      end
    end

    describe 'GET /api/v1/blast_jobs/:id/download/:type' do
      let(:fixture_job_id) { '38334a72-e8e7-4732-872b-24d3f8723563' }
      let(:fixture_source_dir) { File.join(__dir__, 'fixtures', fixture_job_id) }
      let(:fixture_job_dir) { File.join(SequenceServer::DOTDIR, fixture_job_id) }

      before do
        FileUtils.mkdir_p(SequenceServer::DOTDIR)
        FileUtils.rm_r(fixture_job_dir) if File.exist?(fixture_job_dir)
        FileUtils.cp_r(fixture_source_dir, SequenceServer::DOTDIR)
        FileUtils.cp(
          File.join(fixture_job_dir, 'expected_outputs', 'sequenceserver-xml_report.xml'),
          File.join(fixture_job_dir, 'sequenceserver-xml_report.xml')
        )
        FileUtils.cp(
          File.join(fixture_job_dir, 'expected_outputs', 'sequenceserver-custom_tsv_report.tsv'),
          File.join(fixture_job_dir, 'sequenceserver-custom_tsv_report.tsv')
        )

        root_dir = File.expand_path(File.join(__dir__, '..'))
        Dir[File.join(fixture_job_dir, '**', '*')].each do |path|
          next unless File.file?(path)

          File.write(path, File.read(path).gsub('$PATH_PREFIX', root_dir))
        end
      end

      it 'exposes available download formats for completed BLAST jobs' do
        get "/api/v1/blast_jobs/#{fixture_job_id}"

        expect(last_response.status).to eq(200)
        downloads = json_body.fetch('data').fetch('downloads')
        expect(downloads).to include(
          include(
            'type' => 'xml',
            'label' => 'XML',
            'url' => "/api/v1/blast_jobs/#{fixture_job_id}/download/xml"
          )
        )
        expect(downloads).to include(
          include(
            'type' => 'custom_tsv',
            'url' => "/api/v1/blast_jobs/#{fixture_job_id}/download/custom_tsv"
          )
        )
      end

      it 'downloads an exported XML report from the API route' do
        get "/api/v1/blast_jobs/#{fixture_job_id}/download/xml"

        expect(last_response.status).to eq(200)
        expect(last_response.headers['Content-Type']).to include('xml')
        expect(last_response.headers['Content-Disposition']).to include('sequenceserver-xml_report.xml')
        expect(last_response.body).to eq(
          File.read(File.join(fixture_job_dir, 'expected_outputs', 'sequenceserver-xml_report.xml'))
        )
      end

      it 'returns 400 for an unsupported download type' do
        get "/api/v1/blast_jobs/#{fixture_job_id}/download/not-a-format"

        expect(last_response.status).to eq(400)
        expect(json_body.fetch('error').fetch('code')).to eq('invalid_download_type')
      end

      it 'returns 409 when the BLAST result is not ready for download' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">query_1\nACTGACTGACTG",
          databases: [Database.first.id],
          method: Database.first.type == 'protein' ? 'blastp' : 'blastn'
        )

        get "/api/v1/blast_jobs/#{job.id}/download/xml"

        expect(last_response.status).to eq(409)
        expect(json_body.fetch('error').fetch('code')).to eq('result_unavailable')
      end
    end
  end
end
