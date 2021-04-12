//
// dao.js - DAO base class
//
const assert = require('assert');
const { generate: _uuid } = require('short-uuid');
const Validator = require('jsonschema').Validator;

class DAO {
  //
  // constructor
  //
  constructor(type, db) {
    assert(typeof type === 'string', 'bad dao type name');
    assert(typeof db === 'object', 'bad db type');
    assert(typeof db.replicate === 'function', 'bad db instance');
    this.type = type;
    this.db = db;

    this.docValidator = new Validator();

    this.docValidator.addSchema({
      id: '/NonEmptyString',
      type: 'string',
      minLength: 1,
    });

    this.docValidator.addSchema({
      id: '/DocumentID',
      type: 'string',
      pattern: `^${this.type}:`,
    });
  }

  uuid() {
    return `${this.type}:${_uuid()}`;
  }

  schema = {
    id: '/Document',
    type: 'object',
    properties: {
      _id: { $ref: 'DocumentID' },
      _rev: { $ref: 'NonEmptyString' },
      c_by: { $ref: 'NonEmptyString' },
      c_at: { type: 'integer' },
      m_by: { $ref: 'NonEmptyString' },
      m_at: { type: 'integer' },
    },
    required: ['_id', 'c_by', 'c_at', 'm_by', 'm_at'], // everything but _rev
    additionalProperties: true,
  };

  validate(doc) {
    assert(typeof doc === 'object', 'bad document');
    return this.docValidator.validate(doc, this.schema);
  }

  async create(doc) {
    const vr = this.validate(doc);
    assert(vr.valid, 'invalid document');
    assert(!doc._rev, 'document may already exist');
    const res = await this.db.insert(doc);
    return { _rev: res.rev, ...doc };
  }

  async retrieve(id) {
    assert(typeof id === 'string' && id, 'bad document id');
    const _id = `${this.type}:${id}`;
    try {
      const doc = await this.db.get(_id);
      return doc;
    } catch (err) {
      //console.log(err);
      if (err.statusCode !== 404) throw err; // unexpected error
      return null;
    }
  }

  async update(id, doc) {
    assert(typeof id === 'string' && id, 'bad document id');
    const vr = this.validate(doc);
    assert(vr.valid, 'invalid document');
    assert(doc._id === `${this.type}:${id}`, 'document id mismatch');
    assert(doc._rev, 'document must already exist');
    return this.db.insert(doc).then(res => ({ ...doc, _rev: res.rev }));
  }

  async delete(id, doc) {
    assert(typeof id === 'string' && id, 'bad document id');
    assert(typeof doc === 'object', 'bad document');
    assert(typeof doc._id === 'string' && doc._id, 'invalid document');
    assert(doc._id === `${this.type}:${id}`, 'document id mismatch');
    assert(doc._rev, 'document must already exist');
    return this.db.destroy(doc._id, doc._rev);
  }

  async list(viewName, opts = {}) {
    assert(typeof viewName === 'string' && viewName, 'invalid view');
    assert(typeof opts === 'object', 'invalid options');
    opts = {
      reduce: false,
      include_docs: true,
      ...opts,
    };
    const res = await this.db.partitionedView(
      this.type,
      this.type,
      viewName,
      opts
    );
    return res.rows.map(row => (opts.include_docs ? row.doc : row.value));
  }

  async findOne(viewName, ...key) {
    assert(typeof viewName === 'string' && viewName, 'invalid view');
    assert(Array.isArray(key) && key.length > 0, 'invalid key');
    const res = await this.db.partitionedView(this.type, this.type, viewName, {
      reduce: false,
      include_docs: true,
      limit: 2,
      key,
    });
    assert(res.rows.length <= 1, 'key is not unique');
    return res.rows.length ? res.rows[0].doc : null;
  }

  async exists(viewName, ...key) {
    assert(typeof viewName === 'string' && viewName, 'invalid view');
    assert(Array.isArray(key) && key.length > 0, 'invalid key');
    const res = await this.db.partitionedView(this.type, this.type, viewName, {
      reduce: false,
      include_docs: false,
      limit: 1,
      key,
    });
    return !!res.rows.length;
  }

  async count(viewName, ...key) {
    assert(typeof viewName === 'string' && viewName, 'invalid view');
    assert(Array.isArray(key), 'invalid key');
    const res = await this.db.partitionedView(this.type, this.type, viewName, {
      reduce: true,
      key: key.length ? key : undefined,
    });
    assert(Array.isArray(res.rows));
    return res.rows.length ? res.rows[0].value : 0;
  }

  // static functions /////////////////////////////////////////////////////////

  static touch(doc, userName) {
    assert(typeof doc === 'object', 'bad document');
    assert(typeof userName === 'string', 'bad user name');
    assert(userName, 'invalid user name');
    if (typeof doc.c_by === 'undefined') {
      doc.c_by = userName;
      doc.c_at = Math.floor(Date.now() / 1000);
    }
    doc.m_by = userName;
    doc.m_at = Math.floor(Date.now() / 1000);
    return doc;
  }
}

module.exports = DAO;
