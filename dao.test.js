const DAO = require('./dao.js');
const nano = require('nano');
const { COUCHDB } = process.env;
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

    // delete the existing database (if any)
    try {
      await service.db.destroy(name);
    } catch (e) {
      expect(e.statusCode).toBe(404);
    }

    await service.db.create(name);
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

  // end of tests...
});
