#!/usr/bin/env sh
# Builds the site into public/, ready to upload or deploy.
#
#   ./build.sh           use the deacald.css version this repo is pinned to
#   ./build.sh --latest  move the pin to the newest deacald.css first
#
# It fetches the deacald.css submodule, copies the site into public/, and keeps
# only deacald.css and deacald.js from the kit (not its docs, README or license).
set -eu
cd "$(dirname "$0")"

if [ "${1:-}" = "--latest" ]; then
  git submodule update --init --remote res/deacald
  echo "deacald.css moved to its latest commit. Commit res/deacald to keep it."
else
  git submodule update --init res/deacald
fi

rm -rf public
mkdir public
for f in * .[!.]*; do
  case "$f" in
    public|build.sh|README.md|LICENSE|.git|.gitignore|.gitmodules|.claude|'.[!.]*') ;;
    *) cp -R "$f" public/ ;;
  esac
done

# the kit: just the two files the pages load
rm -rf public/res/deacald
mkdir -p public/res/deacald
cp res/deacald/deacald.css res/deacald/deacald.js public/res/deacald/

echo "Built public/ with deacald.css $(git -C res/deacald rev-parse --short HEAD)."
