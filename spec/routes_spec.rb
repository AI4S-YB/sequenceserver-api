require 'spec_helper'

require 'rack/test'

# Basic unit tests for HTTP / Rack interface.
module SequenceServer
  RSpec.describe 'Routes' do
    ENV['RACK_ENV'] = 'test'
    include Rack::Test::Methods

    before do
      allow(SequenceServer).to receive(:assert_blast_installed_and_compatible).and_return(true)
      SequenceServer.init(database_dir: "#{__dir__}/database/v5/sample")
    end

    let 'app' do
      SequenceServer
    end

    context 'GET /' do
      it 'serves the new frontend entry when a built app is available' do
        get '/'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('text/html')
        expect(last_response.body).to include('<div id="root"></div>')
      end

      it 'returns 404 when api_only mode is enabled' do
        SequenceServer.init(database_dir: "#{__dir__}/database/v5/sample", api_only: true)

        get '/'

        expect(last_response.status).to eq(404)
        expect(last_response.body).to include('Frontend is disabled in API-only mode.')
      end
    end

    context 'GET /databases' do
      it 'serves the SPA entry for the new frontend route' do
        get '/databases'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('text/html')
        expect(last_response.body).to include('<div id="root"></div>')
      end

      it 'returns 404 when api_only mode is enabled' do
        SequenceServer.init(database_dir: "#{__dir__}/database/v5/sample", api_only: true)

        get '/databases'

        expect(last_response.status).to eq(404)
        expect(last_response.body).to include('Frontend is disabled in API-only mode.')
      end
    end

    context 'GET /jobs/blast/:id' do
      it 'serves the SPA entry for nested frontend routes' do
        get '/jobs/blast/example-job'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('text/html')
        expect(last_response.body).to include('<div id="root"></div>')
      end
    end

    context 'GET /favicon.svg' do
      it 'serves static assets from the built frontend' do
        get '/favicon.svg'

        expect(last_response.status).to eq(200)
        expect(last_response.content_type).to include('image/svg+xml')
        expect(last_response.body).to include('<svg')
      end
    end

    context 'GET /:jid' do
      it 'redirects legacy report URLs to the new frontend result page' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">test\nACGT",
          databases: [Database.first.id],
          method: (Database.first.type == 'protein' ? 'blastp' : 'blastn')
        )

        get "/#{job.id}"

        expect(last_response.status).to eq(302)
        expect(last_response.headers['Location']).to end_with("/jobs/blast/#{job.id}")
      end

      it 'falls back to the legacy report page when the built frontend is unavailable' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">test\nACGT",
          databases: [Database.first.id],
          method: (Database.first.type == 'protein' ? 'blastp' : 'blastn')
        )

        allow_any_instance_of(SequenceServer::Routes).to receive(:frontend_app_available?).and_return(false)

        get "/#{job.id}"

        expect(last_response.status).to eq(200)
        expect(last_response.body).to include('<div id="view"')
        expect(last_response.body).to include('sequenceserver-report.min.js')
      end

      it 'returns 404 in api_only mode' do
        job = SequenceServer::BLAST::Job.new(
          sequence: ">test\nACGT",
          databases: [Database.first.id],
          method: (Database.first.type == 'protein' ? 'blastp' : 'blastn')
        )

        SequenceServer.init(database_dir: "#{__dir__}/database/v5/sample", api_only: true)

        get "/#{job.id}"

        expect(last_response.status).to eq(404)
        expect(last_response.body).to include('Frontend is disabled in API-only mode.')
      end
    end

    context 'POST /' do
      before :each do
        get '/' # make a request so we have an env with CSRF token
        @params = {
          'sequence'  => 'AGCTAGCTAGCT',
          'databases' => [Database.first.id],
          'method'    => (Database.first.type == 'protein' ? 'blastp' : 'blastn'),
          '_csrf'     => Rack::Csrf.token(last_request.env)
        }
      end

      it 'returns Bad Request (400) if no blast method is provided' do
        @params.delete('method')
        post '/', @params
        last_response.status.should == 400
      end

      it 'returns Bad Request (400) if no input sequence is provided' do
        @params.delete('sequence')
        post '/', @params
        last_response.status.should == 400
      end

      it 'returns Bad Request (400) if no database id is provided' do
        @params.delete('databases')
        post '/', @params
        last_response.status.should == 400
      end

      it 'returns Bad Request (400) if an empty database list is provided' do
        @params['databases'].pop

        # ensure the list of databases is empty
        @params['databases'].should be_empty

        post '/', @params
        last_response.status.should == 400
      end

      it 'returns Bad Request (400) if incorrect database id is provided' do
        @params['databases'] = ['123']
        post '/', @params
        last_response.status.should == 400
      end

      it 'returns Bad Request (400) if an incorrect blast method is supplied' do
        @params['method'] = 'foo'
        post '/', @params
        last_response.status.should == 400
      end

      it 'returns Bad Request (400) if incorrect advanced params are supplied' do
        @params['advanced'] = '-word_size 5; rm -rf /'
        post '/', @params
        last_response.status.should == 400
      end

      it 'redirects to the new frontend blast job page (302) when correct method, sequence, and database ids are'\
        'provided but no advanced params' do
        post '/', @params
        last_response.should be_redirect
        last_response.status.should eq 302
        last_response.headers['Location'].should match(%r{/jobs/blast/})

        @params['advanced'] = '  '
        post '/', @params
        last_response.should be_redirect
        last_response.status.should == 302
        last_response.headers['Location'].should match(%r{/jobs/blast/})
      end

      it 'redirects to the new frontend blast job page (302) when correct method, sequence, and database ids and'\
        'advanced params are provided' do
        @params['advanced'] = '-evalue 1'
        post '/', @params
        last_response.should be_redirect
        last_response.status.should == 302
        last_response.headers['Location'].should match(%r{/jobs/blast/})
      end
    end

    context 'POST /get_sequence' do
      before :each do
        get '/' # make a request so we have an env with CSRF token
        @csrf_token = Rack::Csrf.token(last_request.env)
      end

      let(:job) do
        SequenceServer::BLAST::Job.new(
          sequence: ">test\nACGT",
          databases: [SequenceServer::Database.ids[1]],
          method: 'blastp'
        )
      end

      it 'returns 422 if no sequence_ids are provided' do
        post '/get_sequence', {
          '_csrf' => @csrf_token,
          'sequence_ids' => "",
          'database_ids' => Database.first.id.to_s
        }

        expect(last_response.status).to eq(422)
        expect(last_response.body).to include('No sequence ids provided')
      end

      it 'returns 422 if no database_ids are provided' do
        post '/get_sequence', {
          '_csrf' => @csrf_token,
          'sequence_ids' => "contig1",
          'database_ids' => ""
        }

        expect(last_response.status).to eq(422)
        expect(last_response.body).to include('No database ids provided')
      end

      it 'does not allow invalid sequence ids' do
        post '/get_sequence', {
          '_csrf' => @csrf_token,
          'sequence_ids' => "invalid_sequence_id';sleep 30;",
          'database_ids' => Database.first.id.to_s
        }

        expect(last_response.status).to eq(422)
        expect(last_response.body).to include('Invalid sequence id(s): invalid_sequence_id')
      end
    end
  end
end
