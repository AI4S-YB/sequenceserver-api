describe 'Cloud sharing entry visibility', type: :feature, js: true do
  include CapybaraHelpers
  before :all do
    SequenceServer.init(
      database_dir: "#{__dir__}/../database/v5",
      cloud_share_url: 'http://localhost:3000/v1/shared-job'
    )
  end

  let(:protein_query) do
    File.read File.join(__dir__, '..', 'sequences', 'protein_query.fa')
  end

  let(:protein_databases) do
    [
      'Sinvicta 2-2-3 prot subset',
      '2020-11 Swiss-Prot insecta'
    ]
  end

  it 'hides cloud sharing controls even when the backend endpoint is configured' do
    perform_search(query: protein_query,
                   databases: protein_databases.values_at(0))

    expect(page).not_to have_button('Share to cloud')
    expect(page).to have_link('Send by email')
    expect(page).to have_link('Copy URL to clipboard')
  end
end
