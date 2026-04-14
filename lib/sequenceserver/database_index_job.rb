require 'sequenceserver/job'

module SequenceServer
  # Asynchronous job that formats a FASTA file into a BLAST database.
  class DatabaseIndexJob < Job
    def initialize(params)
      super do
        @database_id = params.fetch(:database_id)
        @path = params.fetch(:path)
        @title = params.fetch(:title)
        @sequence_type = params.fetch(:sequence_type).to_s
        @taxid = Integer(params.fetch(:taxid, 0))
      end
    end

    attr_reader :database_id, :path, :sequence_type, :taxid, :title

    def command
      "makeblastdb -parse_seqids -hash_index -in '#{path}'" \
        " -dbtype #{sequence_type.slice(0, 4)} -title '#{title}'" \
        " -taxid #{taxid}"
    end

    def run
      mark_started!
      sys(command, path: config[:bin], stdout: stdout, stderr: stderr)
      SequenceServer.refresh_databases!
      done!
    rescue CommandFailed => e
      done! e.exitstatus
    end

    def raise!
      return unless done? && exitstatus != 0

      fail SystemError, File.read(stderr)
    end
  end
end
