# dao-couchdb

And opinionated DAO for partitioned couchdb/cloudant databases

## description

Implements basic CRUD and list operations as a DAO

## interface details

```javascript
const dao = new DAO(type, db); // generate a new dao instance

dao.create(doc); // create a new document

dao.retrieve(id); // get a document by id

dao.update(id, doc); // update an existing document

dao.delete(id, doc); // delete an existing document

dao.list(viewName, opts); // return a list of documents from a view.

dao.findOne(viewName, ...key); // find a unique document from a view.

dao.exists(viewName, ...key); // returns true/false if a key exists in a view.

dao.count(viewName, ...key); // count the number of matching keys that exist in a view.

// Misc functions

dao.uuid(); // generate a unique _id in the form `${type}:22-random-chars`

dao.validate(doc); // validate a document

// Static functions

DAO.touch(doc, userName); // update a document's c_by, c_at, m_by and m_at fields
```

## example implementation

## Testing

Tests require a couchdb/cloudant instance, a simple shell file to deploy a local db via docker has bin included.

```bash
COUCHDB_USER=admin COUCHDB_PASSWORD=password bin/dao-test-db
COUCHDB='http://admin:password@localhost:5984/test-db' npm run test-watch
```
