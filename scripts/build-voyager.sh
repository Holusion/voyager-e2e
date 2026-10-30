#!/bin/sh
# Build a Voyager revision into an isolated directory, for use as VOYAGER_DIST.
#
#   scripts/build-voyager.sh <repository> <ref> <directory> [dev|prod|both]
#
# <repository> may be a URL or a local path; <ref> anything `git fetch` accepts
# (a branch, a tag, or e.g. refs/remotes/origin/master in a local clone).
# The last argument picks the bundles to build: development (the default), production, or both.
# The built application ends up in <directory>/dist.
set -eu

if [ $# -lt 3 ] || [ $# -gt 4 ]; then
  echo "Usage: $0 <repository> <ref> <directory> [dev|prod|both]" >&2
  exit 2
fi
repository=$1
ref=$2
directory=$3
bundles=${4:-dev}
case $bundles in
  dev|prod|both) ;;
  *) echo "Unknown bundles \"$bundles\": dev, prod or both" >&2; exit 2 ;;
esac

mkdir -p "$directory"
cd "$directory"
[ -d .git ] || git init --quiet
git fetch --quiet --depth 1 "$repository" "$ref"
git checkout --quiet --force --detach FETCH_HEAD
echo "Building $(git rev-parse HEAD) ($ref from $repository, $bundles)"
npm ci --no-audit --no-fund --loglevel=error
if [ "$bundles" != prod ]; then npm run build-dev; fi
if [ "$bundles" != dev ]; then npm run build-prod; fi
