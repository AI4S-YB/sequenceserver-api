module ApiHelpers
  def json_body
    JSON.parse(last_response.body)
  end
end
