#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."
destination=${1:-public-dist}
mkdir "$destination"
cp .nojekyll robots.txt *.html *.js *.css "$destination/"
cp -R data experiences fakesite skills oedro-editor rclone-macmini r "$destination/"
rsync -a --exclude='/onboarding/*.webp' --exclude='/loyalty/M02.png' --exclude='/loyalty/S02.png' assets/ "$destination/assets/"
