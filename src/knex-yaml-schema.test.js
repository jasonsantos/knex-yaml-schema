/* tslint:disable */
const yamlSchemaEngine = require("./knex-yaml-schema");

const yamlSchema = pub =>
  yamlSchemaEngine(
    { raw: async n => n, schema: { withSchema: () => pub } },
    Promise
  );

const dummyColumn = {
  comment: s => console.log("^^^ comment:", s),
  index: s => console.log("^^^ index:", s || true),
  unique: s => console.log("^^^ unique: true"),
  primary: s => console.log("^^^ primary: true"),
  defaultTo: s => console.log("^^^ defaultTo: true")
};

const dummyTable = {
  integer: name => console.log("integer:", name) || dummyColumn,
  float: name => console.log("float:", name) || dummyColumn,
  dateTime: name => console.log("dateTime:", name) || dummyColumn,
  date: name => console.log("date:", name) || dummyColumn,
  string: name => console.log("string:", name) || dummyColumn,
  uuid: name => console.log("uuid:", name) || dummyColumn,
  comment: name => console.log("comment:", name) || dummyColumn,
  timestamps: () => console.log("timestamps: default") || dummyColumn,
  enum: (name, list) => console.log("enum:", name, list) || dummyColumn
};

const dummySchema = {
  dropTable: async (tableName, cb) => {},
  dropTableIfExists: async (tableName, cb) => {},
  createTable: async (tableName, cb) =>
    console.log("\n\n\n# CREATE TABLE", tableName) || cb(dummyTable)
};

const schema = require("./knex-yaml-schema")(dummySchema);

describe("Tests for the Yaml database creation engine", () => {
  it("should convert to snake_case and drop table", () => {
    yamlSchema({
      ...dummySchema,
      drop: async tableName =>
        expect(tableName).toBe("custom_clinic_guide_history") || dummySchema,
      dropTableIfExists: async tableName =>
        expect(tableName).toBe("custom_clinic_guide_history") || dummySchema
    }).dropTable("CustomClinicGuideHistory");
  });

  it("should throw an error if tables have no properties", done => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async () => dummySchema
    }).create`
      TableOne:
        properties:
    `.catch(
      err =>
        expect(err).toMatch(
          "Invalid Table object 'TableOne' (no properties or data found)"
        ) || done()
    );
  });

  it("should convert to snake_case and create the table in the top-level of the yaml", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          integer: n => expect(n).toBe("id"),
          string: n => expect(n).toBe("a_field_with_a_complicated_name_also")
        }) ||
        expect(tableName).toMatch(
          "table_with_a_very_complicated_name_for_a_change"
        ) ||
        dummySchema
    }).create`
      TableWithAVeryComplicatedNameForAChange:
        properties:
          id: number
          aFieldWithAComplicatedNameAlso:
            type: string
    `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should work as expected for all types of fields", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          integer: n => expect(n).toBe("id"),
          boolean: n => expect(n).toBe("yes_or_no_field"),
          float: n => expect(n).toBe("float_field"),
          date: n => expect(n).toBe("date_field"),
          dateTime: n => expect(n).toBe("date_time_field"),
          string: n => expect(n).toBe("a_field_with_a_complicated_name_also"),
          json: n => expect(n).toBe("json_dump_of_everything"),
          enum: (n, l) =>
            expect(n).toBe("enum_type") ||
            expect(l).toMatchObject(["beatles", "rolling stones"]),
          timestamps: (m, n) => expect(n && m).toBe(true)
        }) ||
        expect(tableName).toMatch(
          "table_with_a_very_complicated_name_for_a_change"
        ) ||
        dummySchema
    }).create`
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
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should convert to snake_case and create every table in the top-level of the yaml", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async tableName =>
        expect(tableName).toMatch(/[a-z_]/) || dummySchema
    }).create`
      TableOne:
        properties:
          id: number
      TableTwo:
        properties:
          id: number
      TableThree:
        properties:
          id: number

      TableFour:
        properties:
          id: number

      TableFiveIsTheLastOne:
        properties:
          id: number

    `;
    expect(res).resolves.toMatchObject([
      dummySchema,
      dummySchema,
      dummySchema,
      dummySchema,
      dummySchema
    ]);
  });

  it("should work as expected for special history timestamp cases too", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          integer: n => expect(n).toBe("id"),
          dateTime: n =>
            expect(n).toMatch(/original_created_at|original_updated_at/) || {},
          timestamps: (m, n) => expect(n && m).toBe(true)
        }) ||
        expect(tableName).toMatch("important_data_table_history") ||
        dummySchema
    }).create`
      ImportantDataTableHistory:
        properties:
          id: number
          originaltimestamps:
            type: originaltimestamps
          timestamps:
            type: timestamps
    `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  const pkMock = n => {
    const column = {
      primary: () => expect(n).toBe("id") || column,
      defaultTo: () => expect(n).toBe("id") || column
    };
    return expect(n).toBe("id") || column;
  };

  it("should make pk types uuids and primary", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          uuid: pkMock
        }) ||
        expect(tableName).toMatch("important_data_table_history") ||
        dummySchema
    }).create`
      ImportantDataTableHistory:
        properties:
          id: pk
    `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should make fields unique when requested", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          uuid: n =>
            expect(n).toBe("id") || {
              primary: () => expect(n).toBe("id"),
              unique: () => expect(n).toBe("id")
            }
        }) ||
        expect(tableName).toMatch("important_data_table") ||
        dummySchema
    }).create`
      ImportantDataTable:
        properties:
          id:
            type: uuid
            unique: true
    `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should make fk and reference types indexes", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          uuid: n =>
            expect(n).toBe("internal_reference_id") || {
              index: () => expect(n).toBe("internal_reference_id")
            },
          integer: n =>
            expect(n).toBe("ec6_patient_id") || {
              index: () => expect(n).toBe("ec6_patient_id")
            }
        }) ||
        expect(tableName).toMatch("important_data_table_history") ||
        dummySchema
    }).create`
      ImportantDataTableHistory:
        properties:
          ec6PatientId: ref
          internalReferenceId: fk
        `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should add comments to fields and tables", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          comment: n => expect(n).toBe("This table is AWFULLY simple"),
          uuid: n =>
            expect(n).toBe("id") || {
              primary: () => expect(n).toBe("id")
            },
          string: n => expect(n).toBe("defaultly_typed_field"),
          integer: n =>
            expect(n).toBe("amount") || {
              comment: c => expect(c).toBe("this is the name, not the alias")
            }
        }) ||
        expect(tableName).toMatch("important_data_table") ||
        dummySchema
    }).create`
      ImportantDataTable:
        description: This table is AWFULLY simple
        properties:
          id:
            type: uuid
            unique: false
          defaultlyTypedField:
            description: this field has no type
          amount:
            type: number
            description: this is the name, not the alias
      `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should default all unknown field types to string", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          uuid: pkMock,
          string: n => expect(n).toBe("strangely_typed_field")
        }) ||
        expect(tableName).toMatch("peculiarly_named_data_table") ||
        dummySchema
    }).create`
      PeculiarlyNamedDataTable:
        properties:
          id: pk
          strangelyTypedField: strangeThing
      `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });

  it("should have support for string size and long text fields", () => {
    const res = yamlSchema({
      ...dummySchema,
      createTable: async (tableName, cb) =>
        cb({
          ...dummyTable,
          uuid: pkMock,
          string: (n, size) =>
            expect(n).toBe("string_field") || expect(size).toBe(400),
          text: n => expect(n).toBe("text_field")
        }) ||
        expect(tableName).toMatch("peculiarly_named_data_table") ||
        dummySchema
    }).create`
      PeculiarlyNamedDataTable:
        properties:
          id: pk
          stringField:
            size: 400
          textField:
            type: text
      `;
    expect(res).resolves.toMatchObject([dummySchema]);
  });
});

describe("Tests for the Yaml database seeding engine", () => {
  it("should reject if the data field is absent or not an array", () => {
    const res = yamlSchemaEngine(tableName => {
      const schema = {
        del: () =>
          expect(tableName).toMatch("peculiarly_named_data_table") ||
          Promise.resolve(),
        insert: async data =>
          expect(tableName).toMatch("peculiarly_named_data_table") ||
          expect(data).toMatchObject([{}]) ||
          Promise.resolve(),
        withSchema: _ => schema,
        returning: _ => schema
      };
      return schema;
    }, Promise).seed`
      PeculiarlyNamedDataTable:
        data:
          stringField: 'This is it'
          textField: 'That is that... in so many words'
      `;
    expect(res).rejects.toMatch("Field 'data' should be a non-empty array");
  });
  it("should adequately convert to snake_case and insert data", done => {
    const res = yamlSchemaEngine(tableName => {
      const schema = {
        del: () =>
          expect(tableName).toMatch("peculiarly_named_data_table") ||
          Promise.resolve(),
        insert: async data =>
          expect(tableName).toMatch("peculiarly_named_data_table") ||
          (await Promise.all(data).then(
            rows =>
              expect(rows).toMatchObject([
                {
                  string_field: "This is it",
                  text_field: "That is that... in so many words"
                }
              ]) || Promise.resolve([1])
          )) ||
          Promise.resolve([1]),
        withSchema: _ => schema,
        returning: _ => schema
      };
      return schema;
    }, Promise).seed`
      PeculiarlyNamedDataTable:
        data:
          -
            stringField: 'This is it'
            textField: 'That is that... in so many words'
      `.then(result => done());
  });
  it("should adequately convert and insert multiple items and different types", done => {
    const res = yamlSchemaEngine(tableName => {
      const schema = {
        del: () =>
          expect(tableName).toMatch("diabetes_treatment_types") ||
          Promise.resolve(),
        insert: async data =>
          expect(tableName).toMatch("diabetes_treatment_types") ||
          (await Promise.all(data).then(rows =>
            expect(rows).toMatchObject([
              {
                high_range: 4,
                low_range: 3,
                name: "Insuline",
                patient_id: 1,
                period: "day",
                therapy_id: 1
              },
              {
                high_range: 7,
                low_range: 3,
                name: "Insuline Pump",
                patient_id: 1,
                period: "day",
                therapy_id: 1
              },
              {
                high_range: 8,
                low_range: 6,
                name: "Pre gestational",
                patient_id: 1,
                period: "day",
                therapy_id: 1
              },
              {
                high_range: 8,
                low_range: 6,
                name: "During Pregnancy",
                patient_id: 1,
                period: "day",
                therapy_id: 1
              },
              {
                high_range: 8,
                low_range: 6,
                name: "Doctor's fiance discretion",
                patient_id: 1,
                period: "day",
                therapy_id: 1
              }
            ])
          )) || [1, 2, 3, 4, 5],
        withSchema: _ => schema,
        returning: _ => schema
      };
      return schema;
    }, Promise).seed`
        DiabetesTreatmentTypes:
          data:
            -
              name: Insuline
              therapyId: 1
              period: day
              lowRange: 3
              highRange: 4
              patientId: 1
            -
              name: Insuline Pump
              therapyId: 1
              period: day
              lowRange: 3
              highRange: 7
              patientId: 1
            -
              name: Pre gestational
              therapyId: 1
              period: day
              lowRange: 6
              highRange: 8
              patientId: 1
            -
              name: During Pregnancy
              therapyId: 1
              period: day
              lowRange: 6
              highRange: 8
              patientId: 1
            -
              name: Doctor's fiance discretion
              therapyId: 1
              period: day
              lowRange: 6
              highRange: 8
              patientId: 1
          `.then(result => done());
  });
  it("should add the inserted Id to references", done => {
    const geologicPeriodIds = [
      "91339ec2-17d5-43c0-8ed4-b89f5af4b601",
      "576c2e43-fb81-4ce2-bf90-7c9ce4e385e6",
      "2e35496c-794b-4f83-b142-7e56ce9b4807",
      "cd2df1e3-fdee-4f5f-9565-84229af28097"
    ];

    const dinossaurIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const res = yamlSchemaEngine(tableName => {
      const schema = {
        del: () =>
          expect(tableName).toMatch(
            /geologic_period|dino_species_for_hunting/
          ) || Promise.resolve(),
        insert: async data =>
          expect(tableName).toMatch(
            /geologic_period|dino_species_for_hunting/
          ) || tableName === "geologic_period"
            ? (await Promise.all(data).then(rows =>
                expect(rows).toMatchObject([
                  { name: "Triassic" },
                  { name: "Jurassic" },
                  { name: "Low Cretaceous" },
                  { name: "High Cretaceous" }
                ])
              )) || geologicPeriodIds
            : (await Promise.all(data).then(rows =>
                expect(rows).toMatchObject([
                  {
                    hunting_period: "day",
                    name: "Pseudosuchia",
                    period_id: geologicPeriodIds[0]
                  },
                  {
                    hunting_period: "day",
                    name: "Eozostrodon",
                    period_id: geologicPeriodIds[0]
                  },
                  {
                    hunting_period: "day",
                    name: "Proganochelys",
                    period_id: geologicPeriodIds[0]
                  },
                  {
                    hunting_period: "day",
                    name: "Sarcolestes",
                    period_id: geologicPeriodIds[1]
                  },
                  {
                    hunting_period: "day",
                    name: "Plesiosaurus",
                    period_id: geologicPeriodIds[1]
                  },
                  {
                    hunting_period: "week",
                    name: "Iguanodon",
                    period_id: geologicPeriodIds[2]
                  },
                  {
                    hunting_period: "week",
                    name: "Ultrasaurus",
                    period_id: geologicPeriodIds[2]
                  },
                  {
                    hunting_period: "week",
                    name: "Oviraptor",
                    period_id: geologicPeriodIds[3]
                  },
                  {
                    hunting_period: "week",
                    name: "Therizinosaurus",
                    period_id: geologicPeriodIds[3]
                  }
                ])
              )) || dinossaurIds,
        withSchema: _ => schema,
        returning: _ => schema
      };
      return schema;
    }, Promise).seed`
    GeologicPeriod:
      data:
        -
          name: Triassic
        -
          name: Jurassic
        -
          name: Low Cretaceous
        -
          name: High Cretaceous

    DinoSpeciesForHunting:
      data:
        -
          name: Pseudosuchia
          periodId: <GeologicPeriod[1]>
          huntingPeriod: day
        -
          name: Eozostrodon
          periodId: <GeologicPeriod[1]>
          huntingPeriod: day
        -
          name: Proganochelys
          periodId: <GeologicPeriod[1]>
          huntingPeriod: day
        -
          name: Sarcolestes
          periodId: <GeologicPeriod[2]>
          huntingPeriod: day
        -
          name: Plesiosaurus
          periodId: <GeologicPeriod[2]>
          huntingPeriod: day
        -
          name: Iguanodon
          periodId: <GeologicPeriod[3]>
          huntingPeriod: week
        -
          name: Ultrasaurus
          periodId: <GeologicPeriod[3]>
          huntingPeriod: week
        -
          name: Oviraptor
          periodId: <GeologicPeriod[4]>
          huntingPeriod: week
        -
          name: Therizinosaurus
          periodId: <GeologicPeriod[4]>
          huntingPeriod: week
    `.then(result => done());
  });
});
