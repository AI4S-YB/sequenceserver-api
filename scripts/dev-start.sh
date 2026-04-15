#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_CONFIG="${SEQUENCESERVER_DEV_CONFIG:-$ROOT_DIR/config/sequenceserver.local.conf}"
BACKEND_URL="${SEQUENCESERVER_DEV_BACKEND_URL:-http://127.0.0.1:4567}"
FRONTEND_URL="${SEQUENCESERVER_DEV_FRONTEND_URL:-http://127.0.0.1:5174}"
FRONTEND_DIR="$ROOT_DIR/sequenceserver-web"
RUBY_BIN_DIR="${SEQUENCESERVER_RUBY_BIN_DIR:-}"

BACKEND_PID=""
FRONTEND_PID=""

if [[ -z "${RUBY_BIN_DIR}" && -x "$HOME/.rubies/ruby-3.3.6/bin/bundle" ]]; then
  RUBY_BIN_DIR="$HOME/.rubies/ruby-3.3.6/bin"
fi

if [[ -n "${RUBY_BIN_DIR}" ]]; then
  export PATH="${RUBY_BIN_DIR}:$PATH"
fi

cleanup() {
  local exit_code=$?

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi

  exit "${exit_code}"
}

trap cleanup EXIT INT TERM

if [[ ! -f "${BACKEND_CONFIG}" ]]; then
  echo "Development config not found: ${BACKEND_CONFIG}" >&2
  echo "Set SEQUENCESERVER_DEV_CONFIG to a valid config file before running this script." >&2
  exit 1
fi

if [[ ! -f "${FRONTEND_DIR}/package.json" ]]; then
  echo "Frontend package.json not found: ${FRONTEND_DIR}/package.json" >&2
  exit 1
fi

echo "Starting SequenceServer development environment"
echo "  Backend config : ${BACKEND_CONFIG}"
echo "  Backend URL    : ${BACKEND_URL}"
echo "  Frontend URL   : ${FRONTEND_URL}"
echo "  Database dir   : $ROOT_DIR/data/blast-db"
  echo "  Frontend mode  : Vite dev server with hot reload"
echo "  Note           : frontend changes update immediately; backend Ruby changes still require a restart"
echo "  Ruby bundle    : $(command -v bundle)"
echo

(
  cd "${ROOT_DIR}"
  bundle exec bin/sequenceserver -c "${BACKEND_CONFIG}"
) &
BACKEND_PID=$!

sleep 2

if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
  wait "${BACKEND_PID}"
  exit $?
fi

(
  cd "${FRONTEND_DIR}"
  VITE_API_BASE_URL="${BACKEND_URL}" npm run dev
) &
FRONTEND_PID=$!

while true; do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    wait "${BACKEND_PID}"
    exit $?
  fi

  if ! kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    wait "${FRONTEND_PID}"
    exit $?
  fi

  sleep 1
done
