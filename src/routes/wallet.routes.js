const router = require('express').Router();
const c = require('../controllers/wallet.controller');

router.get('/', c.balance);
router.get('/transactions', c.transactions);
router.post('/topup', c.topup);
router.get('/topup/:id', c.topupStatus);
router.post('/topup/:id/cancel', c.topupCancel);
// REMOVED: POST /charge let a rider debit (and, with a negative amount, CREDIT) their own wallet.
// Wallet debits happen only server-side for ride payments; credits only via verified provider webhooks.

module.exports = router;
