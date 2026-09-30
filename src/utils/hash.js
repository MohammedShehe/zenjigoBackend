const crypto = require('crypto');
const bcrypt = require('bcrypt');
async function hashPassword(password){ return bcrypt.hash(password, 12); }
async function comparePassword(password, hash){ return bcrypt.compare(password, hash); }
function hashToken(token){ return crypto.createHash('sha256').update(token).digest('hex'); }
function randomToken(bytes=32){ return crypto.randomBytes(bytes).toString('hex'); }
module.exports={hashPassword,comparePassword,hashToken,randomToken};
