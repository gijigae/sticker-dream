#!/bin/bash
cd "$(dirname "$0")"
exec ./node_modules/.bin/tsx --env-file=.env --watch src/server.ts

