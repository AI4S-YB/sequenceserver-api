# SequenceServer API

This repository is a frontend-separation and API-focused fork of the upstream SequenceServer project.

The Chinese documentation is the primary entry for this fork:

- [README.zh-CN.md](README.zh-CN.md)
- [docs/project-status-report.zh-CN.md](docs/project-status-report.zh-CN.md)
- [docs/frontend-replacement-checklist.zh-CN.md](docs/frontend-replacement-checklist.zh-CN.md)

## Current status

The project is currently usable as a first working release with:

- `/api/v1/*` REST APIs
- a separated frontend in `sequenceserver-web`
- BLAST submission, database management, job tracking, and result browsing
- OpenAPI / Swagger documentation

## Local development entry points

- Frontend app: `http://127.0.0.1:5174/`
- API docs: `http://127.0.0.1:4567/api`
- Swagger UI: `http://127.0.0.1:4567/api/docs`
- OpenAPI JSON: `http://127.0.0.1:4567/api/openapi.json`

The local development config currently enables `api_only: true`, so `http://127.0.0.1:4567/` is not used as a page entry in development.

## License

This fork remains licensed under `AGPL-3.0`, consistent with upstream SequenceServer.

- [LICENSE.txt](LICENSE.txt)
- [COPYRIGHT.txt](COPYRIGHT.txt)

## Upstream reference

The original upstream SequenceServer project overview and installation guidance remain available from the upstream project site:

- https://sequenceserver.com/
