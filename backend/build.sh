#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input

# Optional controls:
# - SKIP_DB_MIGRATIONS=true: skip migrations in build phase
# - ALLOW_MIGRATION_FAILURE=true: continue build if migration fails
# Default behavior on Render: allow migration failure so deploy is not blocked by
# temporary or environment-specific DB connectivity issues.
if [ "${SKIP_DB_MIGRATIONS:-false}" = "true" ]; then
	echo "Skipping database migrations because SKIP_DB_MIGRATIONS=true"
	exit 0
fi

if python manage.py migrate --no-input; then
	echo "Database migrations applied successfully"
else
	if [ "${ALLOW_MIGRATION_FAILURE:-${RENDER:-false}}" = "true" ]; then
		echo "Migration failed, but ALLOW_MIGRATION_FAILURE is enabled. Continuing build."
		echo "Run migrations at startup or via Render shell when DB is reachable."
	else
		echo "Migration failed and ALLOW_MIGRATION_FAILURE is disabled. Failing build."
		exit 1
	fi
fi