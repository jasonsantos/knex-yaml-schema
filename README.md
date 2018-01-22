# knex-yaml-schema

[![codecov](https://codecov.io/gh/jasonsantos/knex-yaml-schema/branch/master/graph/badge.svg)](https://codecov.io/gh/jasonsantos/knex-yaml-schema)

An opinionated tool that uses YAML to create and populate tables using knexjs

## Installation

### using NPM

```bash
npm install knex-yaml-schema --save
```

### using Yarn

```bash
yarn add knex-yaml-schema
```

## Features

* uses `yaml` schema to declare tables in a simple, readable way
* uses `camelCase` to reference tables and fields, and converts automatically to `snake_case`
* inserts data in a simple way, allowing you to keep your references consistent
* resolves dependencies using a simple syntax, so you can insert rows that depend on other row's IDs

## API

### Initializing the library

The module itself is a function, which takes a `knex` instance and `Promise` as parameters.

```javascript
const knex = require("knex")({ client: "pg" });
const schema = require("knex-yaml-schema")(knex, Promise);
```

### schema.create(schemaYamlString)

Creates the tables specified in the yaml schema. The Yaml syntax is explained in _usage_ below.

Table and field names will be converted from `camelCase` to `snake_case`.

### schema.dropTable(tableName) | schema.dropTable([tableName, ...])

Drops the tables specified. Names will be converted from `camelCase` to `snake_case`.

### schema.seed(yamlTableData)

Deletes all data in the tables specified and fills them with the given `yaml` fixtures.

When inserting multiple tables in the same command, you can create refereces -- using the inserted PK of a row to populate another row from another table.

The syntax for doing this is simple:

```yaml
Artist:
  data:
    -
        name: Miles Davis
    -
        name: Jimmy Hendrix
Album:
  data:
    -
        name: Kind of Blue
        artistId: <Artist[1]>
    -
        name: Blue Haze
        artistId: <Artist[1]>
    -
        name: Are You Experienced
        artistId: <Artist[2]>
    -
        name: Axis: Bold As Love
        artistId: <Artist[2]>
    -
        name: Band of Gypsies
        artistId: <Artist[2]>
```

Table and field names will be converted from `camelCase` to `snake_case`.

## Usage

### Creating tables

```javascript
const pg = require("knex")({ client: "pg" });
const schema = require("knex-yaml-schema")(knex, Promise);

schema.create`
      TableWithAVeryComplicatedNameForAChange:
        properties:
          id: number
          floatField:
            type: number
            format: float
          dateField:
            type: date
          dateTimeField:
            type: datetime
          yesOrNoField:
            type: boolean
          jsonDumpOfEverything:
            type: json
          enumType:
            type: enum ['beatles', 'rolling stones']
          aFieldWithAComplicatedNameAlso:
            type: string
          timestamps:
            type: timestamps
    `;
```

### Field types

#### pk

        notes: primary key -- an auto-generated uuid
        details:
          - unique: true
          - indexed: true
          - not null

#### fk

        notes: foreign key -- a uuid linked to the PK of a table in the database
        details:
          - indexed: true
          - not null

#### uuid

        notes: a simple uuid field

#### ref

        notes: reference -- a number representing the ID of an external back-end entity
        details:
          - indexed: true
          - not null

#### enum

        notes: string field with a limited list of possible values

#### string

        notes: string field with default size of 255 characters.
        details:
          - size: <vale> -- indicates the size of the string field

#### text

        notes: long text field

#### json

        notes: string field containing a json dump

#### boolean

        notes: simple logic field

#### date

        notes: date field. should ignore time

#### datetime

        notes: datetime field.

#### number

        notes: a numeric value with several possible formats. defaults to 'integer'
        details:
          - format:integer -- standard integer number
          - format:float -- low precision floating-point number

#### timestamps

        notes: shortcut to automatically create two fields for controlling table timestamps. Given field name will be ignored and replaced by the two standard field names.
        details:
          - name: created_at: timestampz -- defaults to now()
          - name: updated_at: timestampz -- defaults to now()
          - not null

#### originaltimestamps

        notes: shortcut to automatically create two fields for storing audit timestamps. Given field name will be ignored and replaced by the two standard field names.
        details:
          - name: original_created_at: timestampz -- defaults to now()
          - name: original_updated_at: timestampz -- defaults to now()
          - not null

## License

MIT © Jason Santos
