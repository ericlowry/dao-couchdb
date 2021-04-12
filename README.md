# dao-couchdb

And opinionated DAO for partitioned couchdb/cloudant databases

## description

Implements basic CRUD and list operations as a DAO

## interface details

```javascript
const dao = new DAO(type, db); // generate a new dao instance.

const doc = await dao.create(doc); // create a new document.

const doc = await dao.retrieve(id); // returns a document by it's id or returns null if not found.

const doc = await dao.update(id, doc); // update an existing document.

await dao.delete(id, doc); // deletes an existing document.

const docs = await dao.list(viewName, opts); // return a list of documents from a view.

const doc = await dao.findOne(viewName, ...key); // find a unique document from a view.

const found = dao.exists(viewName, ...key); // returns true/false if a key exists in a view.

const count = dao.count(viewName, ...key); // count the number of matching keys that exist in a view.

// Misc functions

const _id = dao.uuid(); // generate a unique _id in the form `${type}:22-random-chars`

const [id, rev] = dao.info(doc); // get the id and rev from an existing document (typical)
const [id, rev, createdBy, createdAt, modifiedBy, modifiedAt] = dao.info(doc); // full info

const res = dao.validate(doc); // validate a document
if (!res.valid) console.error(res.errors);

// Static functions

DAO.touch(doc, userName); // update a document's c_by, c_at, m_by and m_at fields
```

## example implementation

## Testing

Tests require docker, which will spin up a couchdb instance on http://admin:admin@localhost:6984/

```bash
npm test
npm test-watch
```
