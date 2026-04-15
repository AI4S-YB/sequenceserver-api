#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/sequenceserver-web"
PROD_CONFIG="${SEQUENCESERVER_PROD_CONFIG:-${SEQUENCESERVER_CONFIG:-$ROOT_DIR/config/sequenceserver.local.conf}}"
PROD_API_BASE_URL="${PROD_VITE_API_BASE_URL:-}"
SKIP_FRONTEND_BUILD="${SKIP_FRONTEND_BUILD:-0}"
RUBY_BIN_DIR="${SEQUENCESERVER_RUBY_BIN_DIR:-}"

if [[ -z "${RUBY_BIN_DIR}" && -x "$HOME/.rubies/ruby-3.3.6/bin/bundle" ]]; then
  RUBY_BIN_DIR="$HOME/.rubies/ruby-3.3.6/bin"
fi

if [[ -n "${RUBY_BIN_DIR}" ]]; then
  export PATH="${RUBY_BIN_DIR}:$PATH"
fi

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
  echo "Frontend package.json not found: ${FRONTEND_DIR}/package.json" >&2
  exit 1
fi

if [[ -n "${PROD_CONFIG}" && ! -f "${PROD_CONFIG}" ]]; then
  echo "Production config not found: ${PROD_CONFIG}" >&2
  exit 1
fi

echo "Starting SequenceServer production environment"
echo "  Frontend mode  : build once and serve from Ruby backend"
if [[ -n "${PROD_API_BASE_URL}" ]]; then
  echo "  Frontend API   : ${PROD_API_BASE_URL}"
else
  echo "  Frontend API   : same-origin relative /api/v1/*"
fi
if [[ -n "${PROD_CONFIG}" ]]; then
  echo "  Backend config : ${PROD_CONFIG}"
else
  echo "  Backend config : default SequenceServer config resolution"
fi
echo "  Database dir   : $ROOT_DIR/data/blast-db"
echo "  Ruby bundle    : $(command -v bundle)"
echo

if [[ "${SKIP_FRONTEND_BUILD}" != "1" ]]; then
  echo "Building frontend bundle..."
  (
    cd "${FRONTEND_DIR}"
    VITE_API_BASE_URL="${PROD_API_BASE_URL}" npm run build
  )
  echo
else
  echo "Skipping frontend build because SKIP_FRONTEND_BUILD=1"
  echo
fi

cd "${ROOT_DIR}"

if [[ -n "${PROD_CONFIG}" ]]; then
  exec bundle exec bin/sequenceserver -c "${PROD_CONFIG}"
else
  exec bundle exec bin/sequenceserver
fi
