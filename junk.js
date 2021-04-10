
const nano = require('nano');

const db = nano(process.env.COUCHDB);

db.info().then(console.log).catch(console.error);