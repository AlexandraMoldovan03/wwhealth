#!/bin/sh
# Runs the SQL tests on a THROWAWAY local Postgres (stub auth schema). Never points at Supabase.
#   PGHOST=<socket dir> PGPORT=<port> supabase/tests/run_local.sh
set -e
cd "$(dirname "$0")/.."
DB=wwh_test_$$
psql -U postgres -q -c "create database $DB"
trap 'psql -U postgres -q -c "drop database $DB"' EXIT
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f tests/local_stub.sql
for f in migrations/*.sql; do psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
psql -U postgres -d $DB -q -v ON_ERROR_STOP=1 -f tests/care_journey_test.sql
