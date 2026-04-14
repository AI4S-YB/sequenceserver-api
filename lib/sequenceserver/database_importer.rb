require 'open-uri'
require 'uri'
require 'pathname'

module SequenceServer
  # Imports FASTA content from external sources into the local database area.
  class DatabaseImporter
    def initialize(source)
      @source = (source || {}).transform_keys(&:to_sym)
      @type = @source[:type].to_s
    end

    def default_name
      case @type
      when 'local_path'
        File.basename(local_path)
      when 's3', 'url'
        filename_from_uri(source_uri)
      else
        nil
      end
    end

    def read
      case @type
      when 'local_path'
        read_local_file
      when 's3'
        read_s3_object
      when 'url'
        read_remote_url(source_uri)
      else
        raise InputError, 'source.type must be one of: local_path, s3, url.'
      end
    end

    private

    def read_local_file
      path = local_path
      raise InputError, 'source.path must be an absolute path.' unless Pathname.new(path).absolute?
      raise InputError, 'source.path must point to a readable file.' unless File.file?(path) && File.readable?(path)
      raise InputError, 'source.path is not allowed by server policy.' unless allowed_local_path?(path)

      File.read(path)
    end

    def read_s3_object
      uri = source_uri
      if uri.start_with?('http://', 'https://')
        raise InputError, 'source.uri is not allowed by server policy.' unless allowed_remote_url?(uri)

        return read_remote_url(uri)
      end

      parsed = URI.parse(uri)
      raise InputError, 'source.uri must be an s3:// URI or presigned https URL.' unless parsed.scheme == 's3'
      raise InputError, 'source.uri bucket is not allowed by server policy.' unless allowed_s3_bucket?(parsed.host)

      begin
        require 'aws-sdk-s3'
      rescue LoadError
        raise SystemError, 'aws-sdk-s3 gem is required to import s3:// sources.'
      end

      bucket = parsed.host
      key = parsed.path.sub(%r{\A/}, '')
      raise InputError, 'source.uri must include both bucket and object key.' if bucket.to_s.empty? || key.empty?

      client_options = {}
      client_options[:region] = @source[:region] if @source[:region]
      client = Aws::S3::Client.new(**client_options)
      client.get_object(bucket: bucket, key: key).body.read
    rescue Aws::S3::Errors::ServiceError => e
      raise SystemError, e.message
    end

    def read_remote_url(uri)
      raise InputError, 'source.uri is not allowed by server policy.' unless allowed_remote_url?(uri)

      URI.open(uri, &:read)
    rescue OpenURI::HTTPError, SocketError, SystemCallError, URI::InvalidURIError => e
      raise SystemError, e.message
    end

    def local_path
      @source[:path].to_s
    end

    def source_uri
      @source[:uri].to_s
    end

    def filename_from_uri(uri)
      parsed = URI.parse(uri)
      filename = File.basename(parsed.path)
      filename.empty? ? 'imported.fa' : filename
    rescue URI::InvalidURIError
      'imported.fa'
    end

    def allowed_local_path?(path)
      allowed_prefixes = Array(SequenceServer.config[:allowed_import_paths]).map do |entry|
        File.expand_path(entry.to_s)
      end.reject(&:empty?)
      return false if allowed_prefixes.empty?

      expanded_path = File.expand_path(path)
      allowed_prefixes.any? do |prefix|
        expanded_path == prefix || expanded_path.start_with?("#{prefix}/")
      end
    end

    def allowed_remote_url?(uri)
      allowed_prefixes = Array(SequenceServer.config[:allowed_import_urls]).map(&:to_s).reject(&:empty?)
      return false if allowed_prefixes.empty?

      allowed_prefixes.any? { |prefix| uri.start_with?(prefix) }
    end

    def allowed_s3_bucket?(bucket)
      allowed_buckets = Array(SequenceServer.config[:allowed_s3_buckets]).map(&:to_s).reject(&:empty?)
      return false if allowed_buckets.empty?

      allowed_buckets.include?(bucket.to_s)
    end
  end
end
