#!/bin/bash

# set -e
# set -u

# Connect to postgres database to create the test database
psql -v ON_ERROR_STOP=1 "postgres://magicthing:password@127.0.0.1:5432/postgres" <<-EOSQL
    DROP DATABASE IF EXISTS "magicthing-test";
    CREATE DATABASE "magicthing-test";
EOSQL
