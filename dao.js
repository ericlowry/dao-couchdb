//
// dao.js - DAO base class
//
const assert = require('assert');
const _debug_ = require('debug');
const { generate: _uuid } = require('short-uuid');
const Validator = require('jsonschema').Validator;

class DAO {
  //
  // constructor
  //
  constructor(type, db, debugPrefix = 'dao') {
    assert(typeof type === 'string', 'bad dao type name');
    assert(typeof db === 'object', 'bad db type');
    assert(typeof db.replicate === 'function', 'bad db instance');
    this.type = type;
    this.db = db;
    this.debug = _debug_(`${debugPrefix}:${type}`);

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
    return this.db.get(_id);
  }

  async update(id, doc) {
    assert(typeof id === 'string' && id, 'bad document id');
    const vr = this.validate(doc);
    assert(vr.valid, 'invalid document');
    assert(doc._id === `${this.type}:${id}`, 'document id mismatch');
    assert(doc._rev, 'document must already exist');
    return this.db.insert(doc).then( res => ({ ...doc, _rev: res.rev }));
  }

  async delete(id, doc) {
    assert(typeof id === 'string' && id, 'bad document id');
    assert(typeof doc === 'object', 'bad document');
    assert(typeof doc._id === 'string' && doc._id, 'invalid document');
    assert(doc._id === `${this.type}:${id}`, 'document id mismatch');
    assert(doc._rev, 'document must already exist');
    return this.db.destroy(doc._id, doc._rev);
  }

  async list(viewName, opts = {}) {}

  async findOne(viewName, ...keys) {}

  async exists(viewName, ...keys) {}
}

module.exports = DAO;