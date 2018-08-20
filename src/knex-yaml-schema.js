const snakeCase = require("to-snake-case");
const parser = require("js-yaml");

const asyncCache = require("dryboard");

const validateTable = (name, details) =>
  details && (details.properties || details.data)
    ? Promise.resolve(details)
    : Promise.reject(
        `Invalid Table object '${name}' (no properties or data found)`
      );

const makeTypeCreators = ({ wrapIdentifier }) => ({
  number: ([engine, table, fieldName, fieldDetails]) =>
    fieldDetails.format === "float"
      ? table.float(wrapIdentifier(fieldName))
      : table.integer(wrapIdentifier(fieldName)),
  datetime: ([engine, table, fieldName, fieldDetails]) =>
    table.dateTime(wrapIdentifier(fieldName)),
  date: ([engine, table, fieldName, fieldDetails]) =>
    table.date(wrapIdentifier(fieldName)),
  json: ([engine, table, fieldName, fieldDetails]) =>
    table.json(wrapIdentifier(fieldName)),
  string: ([engine, table, fieldName, fieldDetails]) =>
    table.string(wrapIdentifier(fieldName), fieldDetails.size),
  text: ([engine, table, fieldName, fieldDetails]) =>
    table.text(wrapIdentifier(fieldName)),
  boolean: ([engine, table, fieldName, fieldDetails]) =>
    table.boolean(wrapIdentifier(fieldName)),
  pk: ([engine, table, fieldName, fieldDetails]) =>
    table
      .uuid(wrapIdentifier(fieldName))
      .primary()
      .defaultTo(engine.raw("uuid_generate_v4()")),
  uuid: ([engine, table, fieldName, fieldDetails]) =>
    table.uuid(wrapIdentifier(fieldName)),
  fk: ([engine, table, fieldName, fieldDetails]) =>
    table.uuid(wrapIdentifier(fieldName)).index(), // todo: internal reference table
  ref: ([engine, table, fieldName, fieldDetails]) =>
    table.integer(wrapIdentifier(fieldName)).index(), // external reference
  originaltimestamps: ([engine, table, fieldName, fieldDetails]) =>
    table.dateTime("original_created_at") &&
    table.dateTime("original_updated_at"),
  timestamps: ([engine, table, fieldName, fieldDetails]) =>
    table.timestamps(true, true),
  enum: ([engine, table, fieldName, fieldDetails]) =>
    table.enum(
      wrapIdentifier(fieldName),
      fieldDetails.type.match(/'([^']*)'/g).map(i => i.replace(/'/g, ""))
    )
});

const yamlField = ([engine, table, fieldName, fieldDetails, wrapIdentifier]) => {
  const typeCreators = makeTypeCreators({ wrapIdentifier })
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

const yamlTable = ([engine, tableName, tableDetails, wrapIdentifier]) =>
  validateTable(tableName, tableDetails).then(
    (details, schema = engine.schema.withSchema("public")) =>
      schema.dropTableIfExists(wrapIdentifier(tableName)).then(() => {
        let created = false;
        return schema.createTable(wrapIdentifier(tableName), table => {
          const comment = tableDetails.description || tableDetails.notes;
          comment && table.comment(comment);
          Object.keys(tableDetails.properties).map(fieldName =>
            yamlField([
              engine,
              table,
              fieldName,
              tableDetails.properties[fieldName],
              wrapIdentifier
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

const inflateObjectWithRefs = async (item, { get }, wrapIdentifier) => {
  const keys = Object.keys(item);

  const values = await Promise.all(
    keys.map(async fieldName => await parseValue(item, fieldName, { get }))
  );

  const result = keys
    .map((fieldName, i) => [fieldName, values[i]])
    .reduce(
      (res, [fieldName, value]) => ({
        ...res,
        [wrapIdentifier(fieldName)]: value
      }),
      {}
    );

  return result;
};

const preProcessItem = async (obj, { get }, wrapIdentifier) =>
  await inflateObjectWithRefs(obj, { get }, wrapIdentifier);

const postProcessItem = async (id, idx, { set, key }) =>
  set(key(idx + 1), id) || id;

const insertDataIntoTable = (
  previousResult,
  schema,
  tableName,
  tableData,
  cache,
  wrapIdentifier
) => {
  return previousResult.then(() =>
    validateTable(wrapIdentifier(tableName), tableData)
      .then(
        tableData =>
          Array.isArray(tableData.data)
            ? Promise.resolve(tableData.data)
            : Promise.reject("Field 'data' should be a non-empty array")
      )
      .then(rows =>
        schema(wrapIdentifier(tableName))
          .del()
          .then(async () =>
            schema(wrapIdentifier(tableName))
              .insert(
                await Promise.all(
                  tableData.data.map(item => preProcessItem(item, cache, wrapIdentifier))
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

module.exports = (engine, Promise, wrapIdentifier = snakeCase) => ({
  create: yaml => {
    return engine
      .raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
      .then(() =>
        yamlTables(parser.safeLoad(yaml)).then(allTables =>
          Promise.all(allTables.map(t => yamlTable([engine, ...t, wrapIdentifier])))
        )
      );
  },
  dropTable: tableOrTables => {
    const tables = Array.isArray(tableOrTables)
      ? tableOrTables
      : [tableOrTables];
    return Promise.resolve(
      tables
        .map(wrapIdentifier)
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
            tableName => engine(wrapIdentifier(tableName)).withSchema("public"),
            tableName,
            tableData,
            {
              get,
              set,
              clear,
              key: createKey(tableName)
            },
            wrapIdentifier
          ),
        Promise.resolve()
      )
    )
});
