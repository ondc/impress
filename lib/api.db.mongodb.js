'use strict';

// MongoDB database plugin for Impress Application Server

if (api.mongodb) {

  api.db.mongodb = {};
  api.db.mongodb.schema = {};
  api.db.drivers.mongodb = api.mongodb;

  const client = api.mongodb.MongoClient;

  api.db.mongodb.open = (
    database, // { name, url, collections }
    callback // callback after connection established
    // Example: {
    //   name: 'databaseName',
    //   url: 'mongodb://username:password@host1
    //     [:port1][,host2[:port2],...[,hostN[:portN]]][/[database][?options]]',
    //   collections: ['collection1', 'collection2', ...] // optional
    // }
  ) => {
    client.connect(database.url, (err, con) => {
      if (err) return callback(err);
      database.connection = con;
      api.db.mongodb.mixinDatabase(database);
      if (database.config.collections) {
        database.loadCollections(database.config.collections, callback);
        return;
      }
      con.collections((err, collections) => {
        if (err) return callback(err);
        database.collections = collections.map(
          collection => collection.collectionName
        );
        database.loadCollections(database.collections, callback);
      });
    });
  };

  api.db.mongodb.mixinDatabase = (database) => {

    database.oid = api.mongodb.ObjectID;

    database.loadCollections = (
      collections, // array of string
      callback // after loaded
    ) => {
      const con = database.connection;
      api.metasync.each(collections, (collectionName, cb) => {
        con.collection(collectionName, (err, collection) => {
          if (!err) {
            database[collectionName] = collection;
            return cb();
          }
          con.createCollection(collectionName, (err, collection) => {
            if (err) {
              impress.log.warning(`Can not open collection: ${collectionName}`);
              return;
            }
            database[collectionName] = collection;
            cb();
          });
        });
      }, callback);
    };

    database.generateSchema = (databaseSchema, callback) => {
      const validationResult = api.db.schema.validate(databaseSchema, true);
      const res = validationResult.valid ? 'OK'.green : 'Error'.red.bold;
      console.log('Schema validation: ' + res);
      if (validationResult.valid) {
        const steps = [];
        let collection, collectionName, field, fieldName;
        for (collectionName in databaseSchema) {
          collection = databaseSchema[collectionName];
          if (typeof(collection) === 'object') {
            steps.push(closureEmptyCollection(collectionName));
            for (fieldName in collection.fields) {
              field = collection.fields[fieldName];
              if (field.index) {
                steps.push(closureCreateIndex(
                  collectionName, fieldName, field.index.unique
                ));
              }
            }
            if (collection.data) {
              steps.push(closureInsertData(
                collectionName, collection.data
              ));
            }
          }
        }
        api.metasync.sequential(steps, () => {
          console.log('Done!'.green.bold);
          callback();
        });
      } else {
        const errors = validationResult.errors.join('; ');
        application.log.error('Errors: ' + errors);
      }
      return {
        success: true,
        validation: validationResult
      };
    };

    function closureEmptyCollection(collectionName) {
      const con = database.connection;
      return (callback) => {
        con.collection(collectionName, (err, collection) => {
          if (err) {
            database.loadCollections([collectionName], callback);
            return;
          }
          collection.remove({}, (err /*collection*/) => {
            if (err) return callback(err);
            application.log.error(
              `Collection: ${database.name}.${collectionName} ... empty`
            );
            callback();
          });
        });
      };
    }

    function closureCreateIndex(collectionName, fieldName, unique) {
      const con = database.connection;
      return (callback) => {
        con.collection(collectionName, (err, collection) => {
          if (err) return callback(err);
          const idx = {};
          idx[fieldName] = 1;
          collection.createIndex(idx, { unique }, callback);
        });
      };
    }

    function closureInsertData(collectionName, data) {
      const con = database.connection;
      return (callback) => {
        con.collection(collectionName, (err, collection) => {
          if (err) return callback();
          application.log.error(
            `Inserting default data to: ${database.name}.${collectionName}`
          );
          collection.insert(data, callback);
        });
      };
    }

  };

}
