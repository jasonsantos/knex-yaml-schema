const snakeCase = require("to-snake-case");
const parser = require("js-yaml");

const asyncCache = require("dryboard");

const validateTable = (name, details) =>
  details && (details.properties || details.data)
    ? Promise.resolve(details)
    : Promise.reject(
        `Invalid Table object '${name}' (no properties or data found)`
      );

const typeCreators = {
  number: ([engine, table, fieldName, fieldDetails]) =>
    fieldDetails.format === "float"
      ? table.float(snakeCase(fieldName))
      : table.integer(snakeCase(fieldName)),
  datetime: ([engine, table, fieldName, fieldDetails]) =>
    table.dateTime(snakeCase(fieldName)),
  date: ([engine, table, fieldName, fieldDetails]) =>
    table.date(snakeCase(fieldName)),
  json: ([engine, table, fieldName, fieldDetails]) =>
    table.json(snakeCase(fieldName)),
  string: ([engine, table, fieldName, fieldDetails]) =>
    table.string(snakeCase(fieldName), fieldDetails.size),
  text: ([engine, table, fieldName, fieldDetails]) =>
    table.text(snakeCase(fieldName)),
  boolean: ([engine, table, fieldName, fieldDetails]) =>
    table.boolean(snakeCase(fieldName)),
  pk: ([engine, table, fieldName, fieldDetails]) =>
    table
      .uuid(snakeCase(fieldName))
      .primary()
      .defaultTo(engine.raw("uuid_generate_v4()")),
  uuid: ([engine, table, fieldName, fieldDetails]) =>
    table.uuid(snakeCase(fieldName)),
  fk: ([engine, table, fieldName, fieldDetails]) =>
    table.uuid(snakeCase(fieldName)).index(), // todo: internal reference table
  ref: ([engine, table, fieldName, fieldDetails]) =>
    table.integer(snakeCase(fieldName)).index(), // external reference
  originaltimestamps: ([engine, table, fieldName, fieldDetails]) =>
    table.dateTime("original_created_at") &&
    table.dateTime("original_updated_at"),
  timestamps: ([engine, table, fieldName, fieldDetails]) =>
    table.timestamps(true, true),
  enum: ([engine, table, fieldName, fieldDetails]) =>
    table.enum(
      snakeCase(fieldName),
      fieldDetails.type.match(/'([^']*)'/g).map(i => i.replace(/'/g, ""))
    )
};

const yamlField = ([engine, table, fieldName, fieldDetails]) => {
  const type =
    typeof fieldDetails === "string"
      ? fieldDetails
      : (fieldDetails.type && fieldDetails.type.match(/\w*/)) || "string";
  const createField = typeCreators[type] || typeCreators.string;
  const collumn = createField([engine, table, fieldName, fieldDetails]);

  if (collumn) {
    fieldDetails.unique && collumn.unique();
    fieldDetails.description && collumn.comment(fieldDetails.description);
    fieldDetails.index && collumn.index();
  }
};

const yamlTable = ([engine, tableName, tableDetails]) =>
  validateTable(tableName, tableDetails).then(
    (details, schema = engine.schema.withSchema("public")) =>
      schema.dropTableIfExists(snakeCase(tableName)).then(() => {
        let created = false;
        return schema.createTable(snakeCase(tableName), table => {
          const comment = tableDetails.description || tableDetails.notes;
          comment && table.comment(comment);
          Object.keys(tableDetails.properties).map(fieldName =>
            yamlField([
              engine,
              table,
              fieldName,
              tableDetails.properties[fieldName]
            ])
          );
        });
      })
  ) || schema;

const yamlTables = schema =>
  Promise.all(
    Object.keys(schema).map(tableName => [tableName, schema[tableName]])
  );

const matchReference = value =>
  ((value &&
    value.match &&
    value.length > 5 &&
    value.length < 70 &&
    value.match(/<[A-Z][A-Za-z0-9]*\[\d\d*\]>/)) ||
    [])[0];

const parseValue = async (obj, fieldName, { get }) => {
  const value = obj[fieldName];
  const ref = matchReference(value);
  const res = await get(ref, value, obj);
  return res;
};

const inflateObjectWithRefs = async (item, { get }) => {
  const keys = Object.keys(item);

  const values = await Promise.all(
    keys.map(async fieldName => await parseValue(item, fieldName, { get }))
  );

  const result = keys
    .map((fieldName, i) => [fieldName, values[i]])
    .reduce(
      (res, [fieldName, value]) => ({ ...res, [snakeCase(fieldName)]: value }),
      {}
    );

  return result;
};

const preProcessItem = async (obj, { get }) =>
  await inflateObjectWithRefs(obj, { get });

const postProcessItem = async (id, idx, { set, key }) =>
  set(key(idx + 1), id) || id;

const insertDataIntoTable = (
  previousResult,
  schema,
  tableName,
  tableData,
  cache
) => {
  return previousResult.then(() =>
    validateTable(tableName, tableData)
      .then(
        tableData =>
          Array.isArray(tableData.data)
            ? Promise.resolve(tableData.data)
            : Promise.reject("Field 'data' should be a non-empty array")
      )
      .then(rows =>
        schema(tableName)
          .del()
          .then(async () =>
            schema(tableName)
              .insert(
                await Promise.all(
                  tableData.data.map(item => preProcessItem(item, cache))
                ),
                "id"
              )
              .then(insertedRows =>
                Promise.all(
                  insertedRows.map((item, idx) =>
                    postProcessItem(item, idx, cache)
                  )
                )
              )
          )
      )
  );
};

const createKey = name => index => `<${name}[${index}]>`;

module.exports = (engine, Promise) => ({
  create: yaml => {
    return engine
      .raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
      .then(() =>
        yamlTables(parser.safeLoad(yaml)).then(allTables =>
          Promise.all(allTables.map(t => yamlTable([engine, ...t])))
        )
      );
  },
  dropTable: tableOrTables => {
    const tables = Array.isArray(tableOrTables)
      ? tableOrTables
      : [tableOrTables];
    return Promise.resolve(
      tables
        .map(snakeCase)
        .map(tableName =>
          engine.schema.withSchema("public").dropTable(tableName)
        )
    );
  },
  seed: (yaml, { get, set, clear } = asyncCache.configureDryboard()) =>
    yamlTables(parser.safeLoad(yaml)).then(allTables =>
      allTables.reduce(
        (result, [tableName, tableData]) =>
          insertDataIntoTable(
            result,
            tableName => engine(snakeCase(tableName)).withSchema("public"),
            tableName,
            tableData,
            {
              get,
              set,
              clear,
              key: createKey(tableName)
            }
          ),
        Promise.resolve()
      )
    )
});
