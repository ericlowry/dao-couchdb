const DAO = require('./dao.js');
const nano = require('nano');

const COUCHDB = `${process.env.COUCHDB}-${Math.floor(Date.now() / 1000)}`;

const db = nano(COUCHDB);

const { generate: _uuid } = require('short-uuid');

const serviceUrl = url => {
  const { protocol, username, password, host } = new URL(url);
  return `${protocol}//${username}:${password}@${host}`;
};

const dbName = url => {
  const name = new URL(url).pathname.substr(1); // remove leading '/'
  return name;
};

describe('dao', () => {
  beforeAll(async () => {
    const url = new URL(COUCHDB);
    expect(url.protocol).toMatch(/^https?:/);
    const service = nano(serviceUrl(COUCHDB));
    const name = dbName(COUCHDB);
    expect(name).toMatch(/[a-z][a-z0-9_-]*/);

    await service.db.create(name, { partitioned: true });

    db.insert({
      _id: '_design/WIDGET',
      views: {
        'display-order': {
          reduce: '_count',
          map: ({ _id, name, label }) =>
            _id.split(':')[0] === 'WIDGET' &&
            name &&
            emit([name.toUpperCase()], {
              id: _id.split(':')[1],
              name,
              label,
            }),
        },
        'by-name': {
          reduce: '_count',
          map: ({ _id, name }) =>
            _id.split(':')[0] === 'WIDGET' && name && emit([name], 1),
        },
        'by-status': {
          reduce: '_count',
          map: ({ _id, status }) =>
            _id.split(':')[0] === 'WIDGET' && status && emit([status], 1),
        },
        'by-type': {
          reduce: '_count',
          map: ({ _id, type }) =>
            _id.split(':')[0] === 'WIDGET' && type && emit([type], 1),
        },
        'by-type-status': {
          reduce: '_count',
          map: ({ _id, type, status }) =>
            _id.split(':')[0] === 'WIDGET' &&
            type &&
            status &&
            emit([type, status], 1),
        },
      },
    });

    // insert some known documents...
    const docs = [
      {
        _id: `WIDGET:known-1`,
        name: 'known-1',
        label: 'Known 1',
        type: 'T1',
        status: 'ACTIVE',
      },
      {
        _id: `WIDGET:known-2`,
        name: 'known-2',
        label: 'Known 2',
        type: 'T2',
        status: 'ACTIVE',
      },
      {
        _id: `WIDGET:known-3`,
        name: 'known-3',
        label: 'Known 3',
        type: 'T1',
        status: 'INACTIVE',
      },
    ];
    for (let i = 0; i < docs.length; i++) {
      await db.insert(DAO.touch(docs[i], 'admin'));
    }
  });

  describe('DAO.touch()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a document', () => {
      expect(() => DAO.touch()).toThrow('bad document');
    });

    it('fails with a bad document', () => {
      expect(() => DAO.touch(123)).toThrow('bad document');
    });

    it('fails with a bad user', () => {
      const doc = {};
      expect(() => DAO.touch(doc)).toThrow('bad user name');
    });

    it('fails with a invalid user name', () => {
      const doc = {};
      expect(() => DAO.touch(doc, '')).toThrow('invalid user name');
    });

    it('touches an empty document', () => {
      const doc = {};
      const touched = DAO.touch(doc, 'test');
      expect(touched.c_by).toBe('test');
      expect(typeof touched.c_at).toBe('number');
      expect(touched.m_by).toBe('test');
      expect(typeof touched.m_at).toBe('number');
    });

    it('touches an existing document', () => {
      const ts = Math.floor(Date.now() / 1000) - 10;
      const doc = {
        c_by: 'admin',
        c_at: ts,
        m_by: 'admin',
        m_at: ts,
      };
      const touched = DAO.touch(doc, 'test');
      expect(touched.c_by).toBe('admin');
      expect(touched.c_at).toBe(ts);
      expect(touched.m_by).toBe('test');
      expect(touched.m_at).toBeGreaterThan(ts);
    });
  });

  describe('DAO() - constructor', () => {
    it('fails without a type', async () => {
      expect(() => new DAO()).toThrow('bad dao type name');
    });

    it('fails without a db', async () => {
      expect(() => new DAO('WIDGET')).toThrow('bad db type');
    });

    it('fails without a couchdb db', async () => {
      expect(() => new DAO('WIDGET', {})).toThrow('bad db instance');
    });

    it('constructs a dao', async () => {
      const dao = new DAO('WIDGET', db);
      expect(dao.type === 'WIDGET');
    });
  });

  describe('dao.uuid()', () => {
    const dao = new DAO('WIDGET', db);

    it('generates unique uuids', async () => {
      const uuid1 = dao.uuid();
      expect(uuid1).toMatch(/^WIDGET:[a-zA-Z0-9]{22}$/);
      const uuid2 = dao.uuid();
      expect(uuid2).not.toBe(uuid1);
    });
  });

  describe('dao.validate()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a document', () => {
      expect(() => dao.validate()).toThrow('bad document');
    });

    it('properly validates an empty document', () => {
      const v = dao.validate({});
      expect(v).toHaveProperty('errors');
      expect(v.errors.length).toBe(5);
    });

    it('validates a minimal document', () => {
      const v = dao.validate({
        _id: 'WIDGET:test',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
      });
      expect(v).toHaveProperty('errors');
      expect(v.errors.length).toBe(0);
    });

    it('detects the wrong document type', () => {
      const v = dao.validate({
        _id: 'XXX:test',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
      });
      expect(v).toHaveProperty('errors');
      expect(v.errors.length).toBe(1);
    });

    it('allows additional fields', () => {
      const v = dao.validate({
        _id: 'XXX:test',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        xxx: 'this is allowed...',
      });
      expect(v).toHaveProperty('errors');
      expect(v.errors.length).toBe(1);
    });
  });

  describe('dao.create()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a document', () => {
      expect.assertions(1);
      return dao
        .create()
        .catch(err => expect(err.message).toBe('bad document'));
    });

    it('fails with an empty document', () => {
      expect.assertions(1);
      return dao
        .create({})
        .catch(err => expect(err.message).toBe('invalid document'));
    });

    it('prevents an insert of a document with an _rev', () => {
      expect.assertions(1);
      return dao
        .create({
          _id: 'WIDGET:test-with_rev',
          _rev: 'xxx-any-value-here',
          c_by: 'admin',
          c_at: Math.floor(Date.now() / 1000),
          m_by: 'admin',
          m_at: Math.floor(Date.now() / 1000),
        })
        .catch(err => expect(err.message).toBe('document may already exist'));
    });

    it('inserts a proper document', async () => {
      const _ID = `WIDGET:insert-test-1-${_uuid()}`;
      const doc = await dao.create({
        _id: _ID,
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'test-value',
      });
      expect(doc._rev).toBeTruthy();
      expect(doc.test).toBe('test-value');
      const doc2 = await db.get(_ID);
      expect(doc2._rev).toBe(doc._rev);
      expect(doc2.test).toBe('test-value');
    });

    it('fails on insertion of a conflicting document', async () => {
      expect.assertions(1);
      const _ID = `WIDGET:insert-test-2-${_uuid()}`;
      const doc = {
        _id: _ID,
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
      };
      const d = await db.insert(doc);
      return dao.create(doc).catch(err => expect(err.statusCode).toBe(409));
    });
  });

  describe('dao.retrieve()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a document id', () => {
      expect.assertions(1);
      return dao
        .retrieve()
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails with bad document id type', () => {
      expect.assertions(1);
      return dao
        .retrieve(123)
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails with an empty document id', () => {
      expect.assertions(1);
      return dao
        .retrieve('')
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('retrieves an existing document', async () => {
      const ID = `test-retrieve-1-${_uuid()}`;
      const _ID = `WIDGET:${ID}`;
      const doc = {
        _id: _ID,
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'test-value',
      };
      const res = await db.insert(doc);
      const testDoc = await dao.retrieve(ID);
      expect(testDoc._rev).toBe(res.rev);
      expect(testDoc.test).toBe('test-value');
    });

    it('returns null if a document does not exist', async () => {
      const doc = await dao.retrieve('does-not-exist');
      expect(doc).toBe(null);
    });
  });

  describe('dao.update()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a document id', () => {
      expect.assertions(1);
      return dao
        .update()
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails with bad document id type', () => {
      expect.assertions(1);
      return dao
        .update(123)
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails with an empty document id', () => {
      expect.assertions(1);
      return dao
        .update('')
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails without a document', () => {
      expect.assertions(1);
      return dao
        .update('test-update-id')
        .catch(err => expect(err.message).toBe('bad document'));
    });

    it('fails with bad document type', () => {
      expect.assertions(1);
      return dao
        .update('test-update-id', 123)
        .catch(err => expect(err.message).toBe('bad document'));
    });

    it('fails with an empty document', () => {
      expect.assertions(1);
      return dao
        .update('test-update-id', {})
        .catch(err => expect(err.message).toBe('invalid document'));
    });

    it('detects a document id mismatch', () => {
      expect.assertions(1);
      const doc = {
        _id: 'WIDGET:test-1',
        _rev: '1-123456789',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'initial-value',
      };
      return dao
        .update('test-2', doc)
        .catch(err => expect(err.message).toBe('document id mismatch'));
    });

    it('detect a missing _rev', () => {
      expect.assertions(1);
      const doc = {
        _id: 'WIDGET:test-1',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'initial-value',
      };
      return dao
        .update('test-1', doc)
        .catch(err => expect(err.message).toBe('document must already exist'));
    });

    it('updates a document', async () => {
      const ID = `test-update-1-${_uuid()}`;
      const _ID = `WIDGET:${ID}`;
      const doc = {
        _id: _ID,
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'initial-value',
      };
      const res = await db.insert(doc);
      const changedDoc = { _rev: res.rev, ...doc, test: 'updated-value' };
      const doc2 = await dao.update(ID, changedDoc);
      // make sure the changes persisted all the way through to the db
      const persistedDoc = await db.get(_ID);
      expect(persistedDoc._rev).not.toBe(doc2.rev);
      expect(persistedDoc.test).toBe('updated-value');
    });
  });

  describe('dao.delete()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a document id', () => {
      expect.assertions(1);
      return dao
        .delete()
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails with bad document id type', () => {
      expect.assertions(1);
      return dao
        .delete(123)
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails with an empty document id', () => {
      expect.assertions(1);
      return dao
        .delete('')
        .catch(err => expect(err.message).toBe('bad document id'));
    });

    it('fails without a document', () => {
      expect.assertions(1);
      return dao
        .delete('test-delete-id')
        .catch(err => expect(err.message).toBe('bad document'));
    });

    it('fails with bad document type', () => {
      expect.assertions(1);
      return dao
        .delete('test-delete-id', 123)
        .catch(err => expect(err.message).toBe('bad document'));
    });

    it('fails with an empty document', () => {
      expect.assertions(1);
      return dao
        .delete('test-delete-id', {})
        .catch(err => expect(err.message).toBe('invalid document'));
    });

    it('detects a document id mismatch', () => {
      expect.assertions(1);
      const doc = {
        _id: 'WIDGET:test-1',
        _rev: '1-123456789',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'initial-value',
      };
      return dao
        .delete('test-2', doc)
        .catch(err => expect(err.message).toBe('document id mismatch'));
    });

    it('detect a missing _rev', () => {
      expect.assertions(1);
      const doc = {
        _id: 'WIDGET:test-1',
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'initial-value',
      };
      return dao
        .delete('test-1', doc)
        .catch(err => expect(err.message).toBe('document must already exist'));
    });

    it('deletes a document', async () => {
      const ID = `test-delete-1-${_uuid()}`;
      const _ID = `WIDGET:${ID}`;
      const doc = {
        _id: _ID,
        c_by: 'admin',
        c_at: Math.floor(Date.now() / 1000),
        m_by: 'admin',
        m_at: Math.floor(Date.now() / 1000),
        test: 'initial-value',
      };
      const res = await db.insert(doc);
      const finalDoc = { _rev: res.rev, ...doc };
      const del = await dao.delete(ID, finalDoc);
      expect(del.id).toBe(finalDoc._id);
      expect(del.rev).not.toBe(finalDoc._rev);
    });
  });

  describe('dao.list()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a view name', () => {
      expect.assertions(1);
      return dao.list().catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails without bad view name', () => {
      expect.assertions(1);
      return dao
        .list(123)
        .catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails without bad opts', () => {
      expect.assertions(1);
      return dao
        .list('by-name', 123)
        .catch(err => expect(err.message).toBe('invalid options'));
    });

    it('by default, returns an array of documents', async () => {
      const res = await dao.list('display-order');
      expect(res.length).toBe(3);
      expect(res[0]._rev).toBeTruthy();
    });

    it('returns an array of key values when !opts.include_docs', async () => {
      const res = await dao.list('display-order', { include_docs: false });
      expect(res.length).toBe(3);
      expect(res[0]._id).not.toBeTruthy();
      expect(res[0]._rev).not.toBeTruthy();
      expect(res[0].id).toBe('known-1');
    });

    it('limits the number of documents returned', async () => {
      const res = await dao.list('display-order', { limit: 2 });
      expect(res.length).toBe(2);
      expect(res[0]._rev).toBeTruthy();
    });

    it('skips documents', async () => {
      const res = await dao.list('display-order', { skip: 1 });
      expect(res.length).toBe(2);
      expect(res[0]._id).toBe(`WIDGET:known-2`);
    });
  });

  describe('dao.findOne()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a view name', () => {
      expect.assertions(1);
      return dao
        .findOne()
        .catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails with a bad view name', () => {
      expect.assertions(1);
      return dao
        .findOne(123)
        .catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails without key', () => {
      expect.assertions(1);
      return dao
        .findOne('by-name')
        .catch(err => expect(err.message).toBe('invalid key'));
    });

    it('finds an existing document', async () => {
      const doc = await dao.findOne('by-name', 'known-1');
      expect(doc._id).toBe('WIDGET:known-1');
      expect(doc._rev).toBeTruthy();
    });

    it('returns null when a key is not found', async () => {
      const doc = await dao.findOne('by-name', 'no-widget-by-this-name');
      expect(doc).toBe(null);
    });

    it('fail when a key is not unique', () => {
      expect.assertions(1);
      return dao
        .findOne('by-status', 'ACTIVE')
        .catch(err => expect(err.message).toBe('key is not unique'));
    });
  });

  describe('dao.exists()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a view name', () => {
      expect.assertions(1);
      return dao
        .exists()
        .catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails with bad view name', () => {
      expect.assertions(1);
      return dao
        .exists(123)
        .catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails without key', () => {
      expect.assertions(1);
      return dao
        .exists('by-name')
        .catch(err => expect(err.message).toBe('invalid key'));
    });

    it('returns true for an existing key', async () => {
      const found = await dao.exists('by-name', 'known-1');
      expect(found).toBe(true);
    });

    it('returns false when a key is not found', async () => {
      const found = await dao.exists('by-name', 'no-widget-by-this-name');
      expect(found).toBe(false);
    });

    it('returns true even if the key is not unique', async () => {
      const found = await dao.exists('by-status', 'ACTIVE');
      expect(found).toBe(true);
    });
  });

  describe('dao.count()', () => {
    const dao = new DAO('WIDGET', db);

    it('fails without a view name', () => {
      expect.assertions(1);
      return dao.count().catch(err => expect(err.message).toBe('invalid view'));
    });

    it('fails with bad view name', () => {
      expect.assertions(1);
      return dao
        .count(123)
        .catch(err => expect(err.message).toBe('invalid view'));
    });

    it('counts all keys in a view', async () => {
      const hits = await dao.count('by-name');
      expect(hits).toBe(3);
    });

    it('counts matching keys in a view', async () => {
      const hits = await dao.count('by-status', 'ACTIVE');
      expect(hits).toBe(2);
    });

    it('counts matching compound keys in a view', async () => {
      const hits = await dao.count('by-type-status', 'T1', 'ACTIVE');
      expect(hits).toBe(1);
    });

    it('return 0 when a matching key is not found in a view', async () => {
      const hits = await dao.count('by-status', 'UNKNOWN-STATUS');
      expect(hits).toBe(0);
    });

    it('return 0 when a compound key keys is not found in a view', async () => {
      const hits = await dao.count(
        'by-status',
        'ACTIVE',
        'UNKNOWN-LEVEL-KEY'
      );
      expect(hits).toBe(0);
    });
  });

  // end of tests...
});
