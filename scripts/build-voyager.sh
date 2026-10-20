#!/bin/sh
# Build a Voyager revision into an isolated directory, for use as VOYAGER_DIST.
#
#   scripts/build-voyager.sh <repository> <ref> <directory>
#
# <repository> may be a URL or a local path; <ref> anything `git fetch` accepts
# (a branch, a tag, or e.g. refs/remotes/origin/master in a local clone).
# The built application ends up in <directory>/dist.
set -eu

if [ $# -ne 3 ]; then
  echo "Usage: $0 <repository> <ref> <directory>" >&2
  exit 2
fi
repository=$1
ref=$2
directory=$3

mkdir -p "$directory"
cd "$directory"
[ -d .git ] || git init --quiet
git fetch --quiet --depth 1 "$repository" "$ref"
git checkout --quiet --force --detach FETCH_HEAD
echo "Building $(git rev-parse HEAD) ($ref from $repository)"
npm ci --no-audit --no-fund --loglevel=error
npm run build-prod
