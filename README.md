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

// Misc functions

dao.uuid(); // generate a unique id

dao.validate(doc); // validate a document
```

## example implementation
